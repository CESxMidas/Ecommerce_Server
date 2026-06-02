import crypto from "crypto";
import mongoose from "mongoose";

import OrderModel from "../models/order.model.js";
import ProductModel from "../models/product.model.js";
import PaymentModel from "../models/payment.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatOrder, formatProduct } from "../utils/formatters.js";
import { ApiError, throwIfInvalid } from "../utils/apiError.js";
import { validatePlaceOrder } from "../validators/order.validator.js";
import { assignLicenseKeysToOrder } from "../utils/licenseKey.js";
import { getSalePriceFromDoc } from "../utils/dataNormalization.js";
import { resolvePurchaseVariant } from "../utils/productVariants.js";
import { validateCoupon } from "../utils/couponHelpers.js";
import { createPayment } from "../services/payment.service.js";
import { getOrCreateCart } from "../utils/cartHelpers.js";
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
  assertTransitionAllowed,
  decrementStockForItems,
  expireStalePendingOrders,
  getInitialOrderStatus,
  markOrderCouponUsedOnce,
  normalizeOrderStatus,
  restoreOrderStockOnce,
  shouldClaimCouponImmediately,
  shouldDeductStockImmediately,
} from "../utils/orderLifecycle.js";

function generateOrderId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `ORD-${date}-${random}`;
}

function computeOrderTotal(subtotal, { tax = 0, shippingFee = 0 } = {}) {
  const normalizedSubtotal = Math.max(0, Number(subtotal) || 0);
  const normalizedTax = Math.max(0, Number(tax) || 0);
  const normalizedShippingFee = Math.max(0, Number(shippingFee) || 0);

  return {
    subtotal: normalizedSubtotal,
    tax: normalizedTax,
    shippingFee: normalizedShippingFee,
    total: Math.max(0, normalizedSubtotal + normalizedTax + normalizedShippingFee),
  };
}

function normalizePaymentMethod(method) {
  const normalized = String(method || "vnpay").trim().toLowerCase();
  const allowed = ["cod", "vnpay"];

  if (!allowed.includes(normalized)) {
    throw new ApiError(400, "Invalid payment method");
  }

  return normalized;
}

function isPhysicalDeliveryItem(item) {
  return (
    item?.product?.deliveryType === "physical" ||
    item?.product?.productType === "hardware"
  );
}

async function validateAndFulfillOrderItems(items = [], session = null) {
  const productIds = items.map((item) => Number(item.productId));
  const products = await ProductModel.find({
    productId: { $in: productIds },
    isActive: true,
  }).session(session);
  const productMap = new Map(products.map((product) => [product.productId, product]));
  const fulfilledItems = [];
  let subtotal = 0;

  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    const dbProduct = productMap.get(productId);

    if (!dbProduct) {
      throw new ApiError(404, `Product ${productId} not found`);
    }

    if (dbProduct.stock < quantity) {
      throw new ApiError(400, `Insufficient stock for "${dbProduct.name}"`);
    }

    const variant = resolvePurchaseVariant(dbProduct, item.variant);
    const unitPrice = variant?.price ?? getSalePriceFromDoc(dbProduct);
    const lineTotal = unitPrice * quantity;

    subtotal += lineTotal;
    fulfilledItems.push({
      productId,
      sku: dbProduct.sku || "",
      quantity,
      unitPrice,
      lineTotal,
      currency: dbProduct.currency || "USD",
      variant,
      product: formatProduct(dbProduct),
      licenseKeys: [],
    });
  }

  return { fulfilledItems, subtotal };
}

export const getOrders = asyncHandler(async (req, res) => {
  await expireStalePendingOrders();

  const filter = { email: req.user.email };

  if (req.user.role === "ADMIN" && req.query.all === "true") {
    delete filter.email;
  } else {
    filter.hiddenByUsers = { $ne: req.user._id };
    filter.$or = [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } },
      { status: { $in: [ORDER_STATUS.FAILED, ORDER_STATUS.CANCELLED] } },
    ];
  }

  const orders = await OrderModel.find(filter).sort({ createdAt: -1 });

  res.json(orders.map(formatOrder));
});

export const getOrderById = asyncHandler(async (req, res) => {
  const order = await OrderModel.findOne({ orderId: req.params.id });

  if (!order) throw new ApiError(404, "Order not found");

  if (req.user.role !== "ADMIN" && order.email !== req.user.email) {
    throw new ApiError(403, "Not allowed");
  }

  res.json(formatOrder(order));
});

export const hideOrder = asyncHandler(async (req, res) => {
  const order = await OrderModel.findOneAndUpdate(
    {
      orderId: req.params.id,
      email: req.user.email,
    },
    {
      $addToSet: { hiddenByUsers: req.user._id },
    },
    { new: true },
  );

  if (!order) throw new ApiError(404, "Order not found");

  res.json({ message: "Order removed from your history" });
});

export const trackOrder = asyncHandler(async (req, res) => {
  const orderId = String(req.body.orderId || "").replace(/^#/, "").trim();
  const contact = String(req.body.contact || "").trim().toLowerCase();

  if (!orderId || !contact) {
    throw new ApiError(400, "Order ID and email or phone are required");
  }

  const order = await OrderModel.findOne({ orderId });

  if (!order) throw new ApiError(404, "Order not found");

  const emailMatches = order.email?.toLowerCase() === contact;
  const phoneMatches = order.phone === contact;

  if (!emailMatches && !phoneMatches) {
    throw new ApiError(403, "Order contact does not match");
  }

  res.json(formatOrder(order));
});

export const createOrder = asyncHandler(async (req, res) => {
  throwIfInvalid(validatePlaceOrder(req.body));
  await expireStalePendingOrders();

  const {
    name,
    phone,
    address,
    pincode = "000000",
    email,
    userId,
    items = [],
    paymentMethod = "vnpay",
    couponCode,
    tax = 0,
    shippingFee = 0,
    currency = "USD",
  } = req.body;
  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
  const session = await mongoose.startSession();
  let order;

  try {
    await session.withTransaction(async () => {
      const { fulfilledItems, subtotal: itemsSubtotal } =
        await validateAndFulfillOrderItems(items, session);

      const allItemsAllowCod = fulfilledItems.every(isPhysicalDeliveryItem);

      if (!allItemsAllowCod && normalizedPaymentMethod === "cod") {
        throw new ApiError(400, "COD is only available for physical products");
      }

      let discount = 0;
      let appliedCouponCode = "";
      let discountedSubtotal = itemsSubtotal;

      if (couponCode?.trim()) {
        const couponResult = await validateCoupon(couponCode, itemsSubtotal, {
          session,
        });

        discount = couponResult.discount;
        discountedSubtotal = couponResult.total;
        appliedCouponCode = couponResult.coupon.code;
      }

      const totals = computeOrderTotal(discountedSubtotal, { tax, shippingFee });
      const orderId = generateOrderId();
      const paymentSession = await createPayment({
        orderId,
        amount: totals.total,
        provider: normalizedPaymentMethod,
        clientIp: req.ip,
        session,
      });
      const expiresAtValue =
        paymentSession.paymentStatus !== PAYMENT_STATUS.PAID &&
        normalizedPaymentMethod !== "cod"
          ? new Date(Date.now() + 5 * 60 * 1000)
          : undefined;
      const stockDeducted = shouldDeductStockImmediately(
        normalizedPaymentMethod,
        paymentSession.paymentStatus,
      );

      if (stockDeducted) {
        await decrementStockForItems(fulfilledItems, session);
      }

      const [createdOrder] = await OrderModel.create(
        [
          {
            orderId,
            paymentId: paymentSession.paymentId,
            paymentStatus: paymentSession.paymentStatus,
            paymentUrl: paymentSession.paymentUrl || "",
            user: req.user?._id || null,
            name: name.trim(),
            phone: phone.trim(),
            address: address.trim(),
            pincode: String(pincode),
            subtotal: itemsSubtotal,
            discount,
            couponCode: appliedCouponCode,
            tax: totals.tax,
            shippingFee: totals.shippingFee,
            currency: String(currency || "USD").trim().toUpperCase(),
            total: totals.total,
            email: (req.user?.email || email).trim().toLowerCase(),
            userId: userId || req.user?.email,
            status: getInitialOrderStatus(
              normalizedPaymentMethod,
              paymentSession.paymentStatus,
            ),
            paymentMethod: normalizedPaymentMethod,
            items: fulfilledItems,
            stockDeducted,
            stockRestored: false,
            expiresAt: expiresAtValue,
          },
        ],
        { session },
      );

      order = createdOrder;

      if (paymentSession.paymentStatus === PAYMENT_STATUS.PAID) {
        order = await assignLicenseKeysToOrder(order, session);
      }

      if (
        stockDeducted &&
        appliedCouponCode &&
        shouldClaimCouponImmediately(
          normalizedPaymentMethod,
          paymentSession.paymentStatus,
        )
      ) {
        order = await markOrderCouponUsedOnce(order, session);
      }

      if (normalizedPaymentMethod === "cod" && req.user?._id) {
        const cart = await getOrCreateCart(req.user._id, session);
        cart.items = [];
        await cart.save({ session });
      }
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({
    ...formatOrder(order),
    paymentUrl: order.paymentUrl || null,
  });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const nextStatus = normalizeOrderStatus(req.body.status);
  const session = await mongoose.startSession();
  let order;

  try {
    await session.withTransaction(async () => {
      order = await OrderModel.findOne({ orderId: req.params.id }).session(session);

      if (!order) throw new ApiError(404, "Order not found");

      assertTransitionAllowed(order.status, nextStatus, true);
      order.status = nextStatus;

      if ([ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED].includes(nextStatus)) {
        await restoreOrderStockOnce(order, session);
        order.paymentStatus =
          nextStatus === ORDER_STATUS.CANCELLED && order.paymentStatus === PAYMENT_STATUS.PAID
            ? PAYMENT_STATUS.REFUNDED
            : PAYMENT_STATUS.FAILED;
      }

      if (nextStatus === ORDER_STATUS.REFUNDED) {
        await restoreOrderStockOnce(order, session);
        order.paymentStatus = PAYMENT_STATUS.REFUNDED;
      }

      await order.save({ session });

      await PaymentModel.updateOne(
        { orderId: order.orderId },
        { status: order.paymentStatus },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  res.json(formatOrder(order));
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  let order;

  try {
    await session.withTransaction(async () => {
      order = await OrderModel.findOne({
        orderId: req.params.id,
        email: req.user.email,
      }).session(session);

      if (!order) throw new ApiError(404, "Order not found");

      assertTransitionAllowed(order.status, ORDER_STATUS.CANCELLED, false);

      if (
        order.paymentStatus === PAYMENT_STATUS.PAID &&
        (order.items || []).some((item) => item.licenseKeys?.length)
      ) {
        throw new ApiError(
          400,
          "Digital items already delivered cannot be cancelled",
        );
      }

      await restoreOrderStockOnce(order, session);

      order.status = ORDER_STATUS.CANCELLED;
      order.paymentStatus =
        order.paymentStatus === PAYMENT_STATUS.PAID
          ? PAYMENT_STATUS.REFUNDED
          : PAYMENT_STATUS.FAILED;
      order.expiresAt = undefined;
      await order.save({ session });

      await PaymentModel.updateOne(
        { orderId: order.orderId },
        {
          status: order.paymentStatus,
          expiresAt: undefined,
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  res.json(formatOrder(order));
});
