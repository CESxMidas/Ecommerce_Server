import { asyncHandler } from "../utils/asyncHandler.js";
import OrderModel from "../models/order.model.js";
import PaymentModel from "../models/payment.model.js";
import { ApiError } from "../utils/apiError.js";
import {
  verifyVNPay,
  createVNPayUrl,
  toVnpayAmount,
} from "../services/vnpay.service.js";
import { markPaymentPaid } from "../services/payment.service.js";
import { markPaymentFailed } from "../utils/orderLifecycle.js";

function getClientRedirect(path) {
  const clientOrigin = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)[0];

  return `${clientOrigin}${path}`;
}

function getOrderRedirect(order, paymentResult) {
  const orderId = encodeURIComponent(order.orderId);

  return getClientRedirect(`/orders/${orderId}?payment=${paymentResult}`);
}

export const vnpayReturn = asyncHandler(async (req, res) => {
  const query = req.query;
  const order = await OrderModel.findOne({ orderId: query.vnp_TxnRef });

  if (!order) throw new ApiError(404, "Order not found");

  if (!verifyVNPay(query)) {
    return res.redirect(getOrderRedirect(order, "invalid_signature"));
  }

  if (Number(query.vnp_Amount) !== toVnpayAmount(order.total)) {
    await markPaymentFailed(order, query);

    return res.redirect(getOrderRedirect(order, "invalid_amount"));
  }

  if (query.vnp_ResponseCode === "00") {
    await markPaymentPaid({
      orderId: order.orderId,
      transactionId: query.vnp_TransactionNo,
      raw: query,
    });

    return res.redirect(getOrderRedirect(order, "success"));
  }

  await markPaymentFailed(order, query);

  return res.redirect(getOrderRedirect(order, "failed"));
});

export const vnpayIpn = asyncHandler(async (req, res) => {
  const query = req.query;
  const orderId = query.vnp_TxnRef;

  if (!verifyVNPay(query)) {
    return res.status(200).json({
      RspCode: "97",
      Message: "Invalid checksum",
    });
  }

  const order = await OrderModel.findOne({ orderId });

  if (!order) {
    return res.status(200).json({
      RspCode: "01",
      Message: "Order not found",
    });
  }

  if (Number(query.vnp_Amount) !== toVnpayAmount(order.total)) {
    return res.status(200).json({
      RspCode: "04",
      Message: "Invalid amount",
    });
  }

  if (order.paymentStatus === "paid") {
    return res.status(200).json({
      RspCode: "02",
      Message: "Order already confirmed",
    });
  }

  if (query.vnp_ResponseCode === "00") {
    await markPaymentPaid({
      orderId: order.orderId,
      transactionId: query.vnp_TransactionNo,
      raw: query,
    });

    return res.status(200).json({
      RspCode: "00",
      Message: "Confirm success",
    });
  }

  await markPaymentFailed(order, query);

  return res.status(200).json({
    RspCode: "00",
    Message: "Confirm success",
  });
});

export const reCreatePaymentUrl = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  const order = await OrderModel.findOne({ orderId, email: req.user.email });

  if (!order) {
    throw new ApiError(
      404,
      "Order does not exist or the payment window has expired",
    );
  }

  if (order.paymentMethod !== "vnpay") {
    throw new ApiError(400, "This order cannot be paid with VNPay");
  }

  if (order.paymentStatus === "paid") {
    throw new ApiError(400, "This order has already been paid");
  }

  if (order.expiresAt && order.expiresAt <= new Date()) {
    throw new ApiError(410, "Payment window has expired");
  }

  const newExpiry = new Date(Date.now() + 5 * 60 * 1000);

  await OrderModel.updateOne(
    { orderId },
    {
      expiresAt: newExpiry,
      paymentStatus: "pending",
    },
  );

  await PaymentModel.updateOne(
    { orderId },
    {
      expiresAt: newExpiry,
      status: "pending",
    },
  );

  const paymentUrl = createVNPayUrl({
    orderId: order.orderId,
    amount: order.total,
    clientIp: req.ip,
  });

  return res.status(200).json({
    success: true,
    paymentUrl,
  });
});
