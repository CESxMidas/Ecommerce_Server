import { Router } from "express";
import {
  reCreatePaymentUrl,
  vnpayIpn,
  vnpayReturn,
} from "../controllers/payment.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

// Đường dẫn nhận kết quả từ VNPay (Không cần đăng nhập vì VNPay gọi vào)
router.get("/vnpay-return", vnpayReturn);
router.get("/vnpay-ipn", vnpayIpn);

// 🌟 THÊM ĐƯỜNG DẪN NÀY: API phục vụ nút bấm "Thanh toán lại" của Frontend
// Endpoint thực tế sẽ là: POST http://localhost:888/api/payments/re-create-vnpay
router.post("/re-create-vnpay", protect, reCreatePaymentUrl);

export default router;
