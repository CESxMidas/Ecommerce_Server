import PaymentModel from "../models/payment.model.js";
import OrderModel from "../models/order.model.js";
import ProductModel from "../models/product.model.js";
import { createVNPayUrl } from "./vnpay.service.js";
import { assignLicenseKeysToOrder } from "../utils/licenseKey.js";

async function decrementOrderStockOnce(order) {
  if (!order || order.stockDeducted) {
    return;
  }

  for (const item of order.items || []) {
    const updated = await ProductModel.findOneAndUpdate(
      {
        productId: item.productId,
        stock: { $gte: item.quantity },
      },
      { $inc: { stock: -item.quantity } },
      { new: true },
    );

    if (!updated) {
      throw new Error(`Stock failed for product ${item.productId}`);
    }
  }

  order.stockDeducted = true;
  await order.save();
}

function resolveInitialPaymentStatus(provider) {
  if (provider === "cod") {
    return "awaiting_cod";
  }

  return "pending";
}

export async function createPayment({ orderId, amount, provider }) {
  const paymentId = `PAY-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
  const initialStatus = resolveInitialPaymentStatus(provider);
  let paymentUrl = null;

  if (provider === "vnpay") {
    paymentUrl = createVNPayUrl({ orderId, amount });
  }

  const expiresAt =
    initialStatus !== "paid" && provider !== "cod"
      ? new Date(Date.now() + 5 * 60 * 1000)
      : undefined;

  const payment = await PaymentModel.create({
    paymentId,
    orderId,
    provider,
    amount,
    status: initialStatus,
    expiresAt,
  });

  return {
    payment,
    paymentId,
    paymentUrl,
    paymentStatus: payment.status,
  };
}

export async function markPaymentPaid({ orderId, transactionId, raw }) {
  const payment = await PaymentModel.findOne({ orderId });

  if (!payment) return null;

  payment.status = "paid";
  payment.transactionId = transactionId || "";
  payment.rawResponse = raw || {};
  payment.expiresAt = undefined;
  await payment.save();

  const order = await OrderModel.findOne({ orderId });

  if (order) {
    await decrementOrderStockOnce(order);

    order.status = "Processing";
    order.paymentStatus = "paid";
    order.expiresAt = undefined;
    await order.save();
    await assignLicenseKeysToOrder(order);
  }

  return payment;
}
