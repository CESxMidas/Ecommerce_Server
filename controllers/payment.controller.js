import { asyncHandler } from "../utils/asyncHandler.js";
import OrderModel from "../models/order.model.js";
import PaymentModel from "../models/payment.model.js"; // 🌟 THÊM: Import thêm để gia hạn payment rác
import { ApiError } from "../utils/apiError.js";
import { verifyVNPay, createVNPayUrl } from "../services/vnpay.service.js"; // 🌟 THÊM: Import createVNPayUrl để tái tạo link
import { markPaymentPaid } from "../services/payment.service.js";

/* ======================================================= */
/* 1. VNPAY RETURN (HÀM HIỆN TẠI CỦA BẠN - GIỮ NGUYÊN)    */
/* ======================================================= */
export const vnpayReturn = asyncHandler(async (req, res) => {
  const query = req.query;

  const order = await OrderModel.findOne({
    orderId: query.vnp_TxnRef,
  });

  if (!order) throw new ApiError(404, "Order not found");

  // ❗ VERIFY SIGNATURE
  const isValid = verifyVNPay(query);

  if (!isValid) {
    return res.redirect(
      `${process.env.CORS_ORIGIN}/orders?payment=invalid_signature`,
    );
  }

  // ====== 🟢 TRƯỜNG HỢP THANH TOÁN THÀNH CÔNG ======
  if (query.vnp_ResponseCode === "00") {
    await markPaymentPaid({
      orderId: order.orderId,
      transactionId: query.vnp_TransactionNo,
      raw: query,
    });

    // Xóa bỏ trường expiresAt bằng lệnh $unset để đơn hàng được GIỮ LẠI vĩnh viễn
    await OrderModel.updateOne(
      { orderId: order.orderId },
      {
        $unset: { expiresAt: "" }, // Bỏ hạn định 5 phút vì khách đã trả tiền thành công
      },
    );

    return res.redirect(`${process.env.CORS_ORIGIN}/orders?payment=success`);
  }

  // ====== 🔴 TRƯỜNG HỢP THANH TOÁN THẤT BẠI ======
  // Giữ nguyên hạn định expiresAt (đã set lúc tạo đơn) để hệ thống tự hủy sau 5 phút.
  // Đồng thời đổi trạng thái paymentStatus sang "failed" để Frontend nhận biết hiển thị nút "Thanh toán lại".
  await OrderModel.updateOne(
    { orderId: order.orderId },
    { paymentStatus: "failed" },
  );
  await PaymentModel.updateOne(
    { orderId: order.orderId },
    {
      status: "failed",
      rawResponse: query,
    },
  );

  return res.redirect(`${process.env.CORS_ORIGIN}/orders?payment=failed`);
});

export const vnpayIpn = asyncHandler(async (req, res) => {
  const query = req.query;
  const orderId = query.vnp_TxnRef;

  const isValid = verifyVNPay(query);

  if (!isValid) {
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

  const expectedAmount = Math.round(order.total * 25000 * 100);
  const receivedAmount = Number(query.vnp_Amount);

  if (receivedAmount !== expectedAmount) {
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

    await OrderModel.updateOne(
      { orderId: order.orderId },
      { $unset: { expiresAt: "" } },
    );

    return res.status(200).json({
      RspCode: "00",
      Message: "Confirm success",
    });
  }

  await OrderModel.updateOne(
    { orderId: order.orderId },
    { paymentStatus: "failed" },
  );

  await PaymentModel.updateOne(
    { orderId: order.orderId },
    {
      status: "failed",
      rawResponse: query,
    },
  );

  return res.status(200).json({
    RspCode: "00",
    Message: "Confirm success",
  });
});

/* ======================================================= */
/* 2. RE-CREATE PAYMENT URL (HÀM BỔ SUNG ĐỂ SỬA LỖI)      */
/* ======================================================= */
export const reCreatePaymentUrl = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  // 1. Tìm đơn hàng lỗi đang cần thanh toán lại thuộc đúng user đăng nhập
  const order = await OrderModel.findOne({ orderId, email: req.user.email });
  if (!order) {
    throw new ApiError(
      404,
      "Đơn hàng không tồn tại hoặc đã quá hạn 5 phút bị hủy!",
    );
  }

  // 2. Gia hạn thêm 5 phút nữa cho đơn hàng này kể từ lúc họ bấm nút làm lại trên UI
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

  // 3. Gọi hàm dịch vụ tạo chuỗi URL mới sang VNPay dựa trên số tiền của đơn hàng cũ
  const paymentUrl = createVNPayUrl({
    orderId: order.orderId,
    amount: order.total,
  });

  // 4. Trả link mới về cho Frontend tiến hành chuyển hướng người dùng đi
  return res.status(200).json({
    success: true,
    paymentUrl,
  });
});
