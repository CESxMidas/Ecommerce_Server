import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, unique: true, index: true },
    orderId: { type: String, required: true, index: true },

    provider: {
      type: String,
      enum: ["vnpay", "stripe", "card", "cod"],
      required: true,
    },

    amount: { type: Number, required: true },

    status: {
      type: String,
      enum: ["initiated", "pending", "awaiting_cod", "paid", "failed", "refunded"],
      default: "initiated",
    },

    transactionId: { type: String, default: "" },

    rawResponse: { type: Object, default: {} },

    // 🌟 THÊM TRƯỜNG NÀY ĐỂ ĐỒNG BỘ TỰ XÓA VỚI ĐƠN HÀNG
    expiresAt: {
      type: Date,
      index: { expires: 0 },
    },
  },
  { timestamps: true },
);

const PaymentModel = mongoose.model("Payment", paymentSchema);

export default PaymentModel;
