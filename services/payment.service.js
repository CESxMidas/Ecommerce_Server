import mongoose from "mongoose";

import PaymentModel from "../models/payment.model.js";
import OrderModel from "../models/order.model.js";
import CartModel from "../models/cart.model.js";
import { createVNPayUrl } from "./vnpay.service.js";
import { assignLicenseKeysToOrder } from "../utils/licenseKey.js";
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
  decrementOrderStockOnce,
  markOrderCouponUsedOnce,
  markPaymentFailed,
} from "../utils/orderLifecycle.js";

function resolveInitialPaymentStatus(provider) {
  if (provider === "cod") {
    return PAYMENT_STATUS.AWAITING_COD;
  }

  return PAYMENT_STATUS.PENDING;
}

export async function createPayment({
  orderId,
  amount,
  provider,
  clientIp,
  session = null,
}) {
  const paymentId = `PAY-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
  const initialStatus = resolveInitialPaymentStatus(provider);
  let paymentUrl = null;

  if (provider === "vnpay") {
    paymentUrl = createVNPayUrl({ orderId, amount, clientIp });
  }

  const expiresAt =
    initialStatus !== "paid" && provider !== "cod"
      ? new Date(Date.now() + 5 * 60 * 1000)
      : undefined;

  const [payment] = await PaymentModel.create(
    [
      {
        paymentId,
        orderId,
        provider,
        amount,
        status: initialStatus,
        expiresAt,
      },
    ],
    { session },
  );

  return {
    payment,
    paymentId,
    paymentUrl,
    paymentStatus: payment.status,
  };
}

export async function markPaymentPaid({ orderId, transactionId, raw }) {
  const session = await mongoose.startSession();
  let paidPayment = null;

  try {
    await session.withTransaction(async () => {
      const payment = await PaymentModel.findOne({ orderId }).session(session);

      if (!payment) {
        paidPayment = null;
        return;
      }

      if (payment.status === PAYMENT_STATUS.PAID) {
        paidPayment = payment;
        return;
      }

      const order = await OrderModel.findOne({ orderId }).session(session);

      if (!order) {
        paidPayment = null;
        return;
      }

      if (
        [ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED, ORDER_STATUS.REFUNDED].includes(
          order.status,
        ) ||
        [PAYMENT_STATUS.FAILED, PAYMENT_STATUS.REFUNDED].includes(
          order.paymentStatus,
        )
      ) {
        paidPayment = null;
        return;
      }

      if (order.expiresAt && order.expiresAt <= new Date()) {
        await markPaymentFailed(order, { reason: "payment_window_expired" }, session);
        paidPayment = null;
        return;
      }

      payment.status = PAYMENT_STATUS.PAID;
      payment.transactionId = transactionId || "";
      payment.rawResponse = raw || {};
      payment.expiresAt = undefined;
      await payment.save({ session });

      await decrementOrderStockOnce(order, session);

      order.status = ORDER_STATUS.PROCESSING;
      order.paymentStatus = PAYMENT_STATUS.PAID;
      order.expiresAt = undefined;
      await order.save({ session });
      await markOrderCouponUsedOnce(order, session);
      await assignLicenseKeysToOrder(order, session);

      if (order.user) {
        await CartModel.updateOne(
          { user: order.user },
          { $set: { items: [] } },
          { session },
        );
      }

      paidPayment = payment;
    });
  } finally {
    await session.endSession();
  }

  return paidPayment;
}
