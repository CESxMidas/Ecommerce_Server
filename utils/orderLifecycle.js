import ProductModel from "../models/product.model.js";
import PaymentModel from "../models/payment.model.js";
import OrderModel from "../models/order.model.js";
import { ApiError } from "./apiError.js";
import { claimCouponUsageByCode } from "./couponHelpers.js";

export const ORDER_STATUS = Object.freeze({
  PENDING_PAYMENT: "PendingPayment",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
  REFUNDED: "Refunded",
});

export const PAYMENT_STATUS = Object.freeze({
  PENDING: "pending",
  AWAITING_COD: "awaiting_cod",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
});

const VALID_ADMIN_TRANSITIONS = {
  [ORDER_STATUS.PENDING_PAYMENT]: [
    ORDER_STATUS.PROCESSING,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.FAILED,
  ],
  [ORDER_STATUS.PROCESSING]: [
    ORDER_STATUS.SHIPPED,
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.REFUNDED,
  ],
  [ORDER_STATUS.SHIPPED]: [
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.REFUNDED,
  ],
  [ORDER_STATUS.DELIVERED]: [ORDER_STATUS.REFUNDED],
  [ORDER_STATUS.CANCELLED]: [],
  [ORDER_STATUS.FAILED]: [],
  [ORDER_STATUS.REFUNDED]: [],
};

export function normalizeOrderStatus(status) {
  const aliases = {
    Pending: ORDER_STATUS.PENDING_PAYMENT,
    Paid: ORDER_STATUS.PROCESSING,
    Processing: ORDER_STATUS.PROCESSING,
    Shipped: ORDER_STATUS.SHIPPED,
    Delivered: ORDER_STATUS.DELIVERED,
    Cancelled: ORDER_STATUS.CANCELLED,
    Failed: ORDER_STATUS.FAILED,
    Refunded: ORDER_STATUS.REFUNDED,
  };

  return aliases[status] || status;
}

export function getInitialOrderStatus(paymentMethod, paymentStatus) {
  if (paymentStatus === PAYMENT_STATUS.PAID || paymentMethod === "cod") {
    return ORDER_STATUS.PROCESSING;
  }

  return ORDER_STATUS.PENDING_PAYMENT;
}

export function shouldDeductStockImmediately(paymentMethod, paymentStatus) {
  return (
    paymentMethod === "cod" ||
    paymentMethod === "vnpay" ||
    paymentStatus === PAYMENT_STATUS.PAID
  );
}

export function shouldClaimCouponImmediately(paymentMethod, paymentStatus) {
  return paymentMethod === "cod" || paymentStatus === PAYMENT_STATUS.PAID;
}

export function assertTransitionAllowed(currentStatus, nextStatus, isAdmin = false) {
  const current = normalizeOrderStatus(currentStatus);
  const next = normalizeOrderStatus(nextStatus);

  if (!Object.values(ORDER_STATUS).includes(next)) {
    throw new ApiError(400, "Invalid order status");
  }

  if (!isAdmin) {
    if (![ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PROCESSING].includes(current)) {
      throw new ApiError(400, "This order can no longer be cancelled");
    }

    if (next !== ORDER_STATUS.CANCELLED) {
      throw new ApiError(403, "This transition is not allowed");
    }

    return next;
  }

  const allowed = VALID_ADMIN_TRANSITIONS[current] || [];

  if (!allowed.includes(next) && current !== next) {
    throw new ApiError(400, `Cannot change order from ${current} to ${next}`);
  }

  return next;
}

export async function decrementStockForItems(items = [], session = null) {
  for (const item of items) {
    const updated = await ProductModel.findOneAndUpdate(
      {
        productId: item.productId,
        stock: { $gte: item.quantity },
      },
      { $inc: { stock: -item.quantity } },
      { new: true, session },
    );

    if (!updated) {
      throw new ApiError(400, `Stock failed for product ${item.productId}`);
    }
  }
}

export async function restoreStockForItems(items = [], session = null) {
  await Promise.all(
    items.map((item) =>
      ProductModel.updateOne(
        { productId: item.productId },
        { $inc: { stock: item.quantity } },
        { session },
      ),
    ),
  );
}

export async function decrementOrderStockOnce(order, session = null) {
  if (!order || order.stockDeducted) {
    return order;
  }

  await decrementStockForItems(order.items || [], session);

  order.stockDeducted = true;
  order.stockRestored = false;
  await order.save({ session });

  return order;
}

export async function restoreOrderStockOnce(order, session = null) {
  if (!order || !order.stockDeducted || order.stockRestored) {
    return order;
  }

  await restoreStockForItems(order.items || [], session);

  order.stockRestored = true;
  await order.save({ session });

  return order;
}

export async function markOrderCouponUsedOnce(order, session = null) {
  if (!order?.couponCode || order.couponUsageIncremented) {
    return order;
  }

  await claimCouponUsageByCode(order.couponCode, session);
  order.couponUsageIncremented = true;
  await order.save({ session });

  return order;
}

export async function markPaymentFailed(order, rawResponse, session = null) {
  if (!order || order.paymentStatus === PAYMENT_STATUS.PAID) {
    return order;
  }

  await restoreOrderStockOnce(order, session);

  order.status = ORDER_STATUS.FAILED;
  order.paymentStatus = PAYMENT_STATUS.FAILED;
  order.expiresAt = undefined;
  await order.save({ session });

  await PaymentModel.updateOne(
    { orderId: order.orderId },
    {
      status: PAYMENT_STATUS.FAILED,
      rawResponse,
      expiresAt: undefined,
    },
    { session },
  );

  return order;
}

export async function expireStalePendingOrders({ limit = 100 } = {}) {
  const expiredOrders = await OrderModel.find({
    paymentMethod: "vnpay",
    paymentStatus: PAYMENT_STATUS.PENDING,
    status: ORDER_STATUS.PENDING_PAYMENT,
    expiresAt: { $lte: new Date() },
  }).limit(limit);

  for (const order of expiredOrders) {
    await markPaymentFailed(order, { reason: "payment_window_expired" });
  }

  return expiredOrders.length;
}
