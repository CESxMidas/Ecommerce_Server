import { Router } from "express";

import { validateCouponCode } from "../controllers/coupon.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/validate", protect, validateCouponCode);

export default router;
