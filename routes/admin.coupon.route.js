import { Router } from "express";

import {
  createCoupon,
  deleteCoupon,
  getCoupons,
  updateCoupon,
} from "../controllers/coupon.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { adminOnly } from "../middleware/admin.middleware.js";

const router = Router();

router.use(protect, adminOnly);

router.get("/", getCoupons);
router.post("/", createCoupon);
router.put("/:id", updateCoupon);
router.delete("/:id", deleteCoupon);

export default router;
