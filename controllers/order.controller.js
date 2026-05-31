import OrderModel from "../models/order.model.js";
import ProductModel from "../models/product.model.js";
import crypto from "crypto";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatOrder, formatProduct } from "../utils/formatters.js";
import { ApiError, throwIfInvalid } from "../utils/apiError.js";
import { validatePlaceOrder } from "../validators/order.validator.js";
import { assignLicenseKeysToOrder } from "../utils/licenseKey.js";
import { getSalePriceFromDoc } from "../utils/dataNormalization.js";
import { resolvePurchaseVariant } from "../utils/productVariants.js";
import {
  validateCoupon,
  incrementCouponUsage,
} from "../utils/couponHelpers.js";

import { createPayment } from "../services/payment.service.js";
import { getOrCreateCart } from "../utils/cartHelpers.js";

/* ========================= */
/* ORDER ID */
/* ========================= */
function generateOrderId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `ORD-${date}-${random}`;
}

/* ========================= */
/* TOTAL CALC */
/* ========================= */
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

function shouldDeductStockImmediately(paymentMethod, paymentStatus) {
  return paymentMethod === "cod" || paymentStatus === "paid";
}

function isPhysicalDeliveryItem(item) {
  return (
    item?.product?.deliveryType === "physical" ||
    item?.product?.productType === "hardware"
  );
}

/* ========================= */
/* VALIDATE + FULFILL ITEMS */
/* ========================= */
async function validateAndFulfillOrderItems(items = []) {
  const productIds = items.map((item) => Number(item.productId));

  const products = await ProductModel.find({
    productId: { $in: productIds },
    isActive: true,
  });

  const productMap = new Map(products.map((p) => [p.productId, p]));

  const fulfilled = [];
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

    fulfilled.push({
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

  return { fulfilledItems: fulfilled, subtotal };
}

/* ========================= */
/* DECREMENT STOCK */
/* ========================= */
async function decrementStockForItems(items = []) {
  for (const item of items) {
    const updated = await ProductModel.findOneAndUpdate(
      {
        productId: item.productId,
        stock: { $gte: item.quantity },
      },
      { $inc: { stock: -item.quantity } },
      { new: true },
    );

    if (!updated) {
      throw new ApiError(400, `Stock failed for product ${item.productId}`);
    }
  }
}

export async function decrementOrderStockOnce(order) {
  if (!order || order.stockDeducted) {
    return order;
  }

  await decrementStockForItems(order.items || []);

  order.stockDeducted = true;
  await order.save();

  return order;
}

/* ========================= */
/* RESTORE STOCK */
/* ========================= */
async function restoreStockForItems(items = []) {
  await Promise.all(
    items.map((item) =>
      ProductModel.updateOne(
        { productId: item.productId },
        { $inc: { stock: item.quantity } },
      ),
    ),
  );
}

/* ========================= */
/* GET ORDERS (CÓ SỬA ĐỔI) */
/* ========================= */
export const getOrders = asyncHandler(async (req, res) => {
  const filter = { email: req.user.email };

  if (req.user.role === "ADMIN" && req.query.all === "true") {
    delete filter.email;
  } else {
    // 🌟 SỬA TẠI ĐÂY: Nếu là khách hàng xem đơn, loại bỏ các đơn có trạng thái "failed"
    // hoặc các đơn đã quá thời gian expiresAt nhưng MongoDB chưa kịp chạy ngầm để xóa.
    filter.$or = [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } },
    ];
  }

  const orders = await OrderModel.find(filter).sort({ createdAt: -1 });

  res.json(orders.map(formatOrder));
});

/* ========================= */
/* GET ORDER BY ID */
/* ========================= */
export const getOrderById = asyncHandler(async (req, res) => {
  const order = await OrderModel.findOne({ orderId: req.params.id });

  if (!order) throw new ApiError(404, "Order not found");

  if (req.user.role !== "ADMIN" && order.email !== req.user.email) {
    throw new ApiError(403, "Not allowed");
  }

  res.json(formatOrder(order));
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

/* ========================= */
/* CREATE ORDER (CÓ SỬA ĐỔI) */
/* ========================= */
export const createOrder = asyncHandler(async (req, res) => {
  throwIfInvalid(validatePlaceOrder(req.body));
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

  /* 1. validate items */
  const { fulfilledItems, subtotal: itemsSubtotal } =
    await validateAndFulfillOrderItems(items);

  const allItemsAllowCod = fulfilledItems.every(isPhysicalDeliveryItem);

  if (!allItemsAllowCod && normalizedPaymentMethod === "cod") {
    throw new ApiError(
      400,
      "COD is only available for physical products",
    );
  }

  /* 2. coupon */
  let discount = 0;
  let appliedCouponCode = "";
  let discountedSubtotal = itemsSubtotal;
  let couponDoc = null;

  if (couponCode?.trim()) {
    const couponResult = await validateCoupon(couponCode, itemsSubtotal);

    discount = couponResult.discount;
    discountedSubtotal = couponResult.total;
    appliedCouponCode = couponResult.coupon.code;
    couponDoc = couponResult.coupon;
  }

  /* 3. total */
  const totals = computeOrderTotal(discountedSubtotal, { tax, shippingFee });

  const orderId = generateOrderId();

  /* 4. PAYMENT (FIXED: ONLY ONE SYSTEM) */
  const paymentSession = await createPayment({
    orderId,
    amount: totals.total,
    provider: normalizedPaymentMethod,
  });

  let order;

  try {
    // 🌟 SỬA TẠI ĐÂY: Nếu phương thức thanh toán online (vnpay, stripe...) thì set hạn sống 5 phút.
    // Nếu chọn giao hàng COD, không cần đặt trường expiresAt (đơn sống vĩnh viễn).
    const expiresAtValue =
      paymentSession.paymentStatus !== "paid" &&
      normalizedPaymentMethod !== "cod"
        ? new Date(Date.now() + 5 * 60 * 1000)
        : undefined;
    const stockDeducted = shouldDeductStockImmediately(
      normalizedPaymentMethod,
      paymentSession.paymentStatus,
    );

    if (stockDeducted) {
      await decrementStockForItems(fulfilledItems);
    }

    order = await OrderModel.create({
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

      status: paymentSession.paymentStatus === "paid" ? "Processing" : "Pending",
      paymentMethod: normalizedPaymentMethod,

      items: fulfilledItems,
      stockDeducted,
      expiresAt: expiresAtValue, // Gán giá trị giới hạn thời gian vào đây
    });

    if (paymentSession.paymentStatus === "paid") {
      order = await assignLicenseKeysToOrder(order);
    }

    if (couponDoc) {
      await incrementCouponUsage(couponDoc._id);
    }
  } catch (err) {
    if (
      shouldDeductStockImmediately(
        normalizedPaymentMethod,
        paymentSession.paymentStatus,
      )
    ) {
      await restoreStockForItems(fulfilledItems);
    }
    throw err;
  }

  /* 6. CLEAR CART (CÓ SỬA ĐỔI) */
  // 🌟 SỬA TẠI ĐÂY: Chỉ xóa sạch giỏ hàng ngay lập tức nếu chọn phương thức giao hàng COD.
  // Đối với thanh toán Online, không xóa ở đây, đợi Frontend kiểm tra thanh toán thành công mới xóa.
  if (normalizedPaymentMethod === "cod" && req.user?._id) {
    const cart = await getOrCreateCart(req.user._id);
    cart.items = [];
    await cart.save();
  }

  /* 7. response */
  res.status(201).json({
    ...formatOrder(order),
    paymentUrl: order.paymentUrl || null,
  });
});

/* ========================= */
/* UPDATE STATUS */
/* ========================= */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const allowed = ["Pending", "Processing", "Delivered", "Cancelled"];

  if (!allowed.includes(status)) {
    throw new ApiError(400, "Invalid status");
  }

  const order = await OrderModel.findOneAndUpdate(
    { orderId: req.params.id },
    { status },
    { new: true },
  );

  if (!order) throw new ApiError(404, "Order not found");

  res.json(formatOrder(order));
});
