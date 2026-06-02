import { Router } from "express";

import authRoutes from "./auth.route.js";
import productRoutes from "./product.route.js";
import categoryRoutes from "./category.route.js";
import cartRoutes from "./cart.route.js";
import orderRoutes from "./order.route.js";
import userRoutes from "./user.route.js";
import wishlistRoutes from "./wishlist.route.js";
import couponRoutes from "./coupon.route.js";
import bannerRoutes from "./banner.route.js";
import blogRoutes from "./blog.route.js";
import adminRoutes from "./admin.route.js";
import adminCouponRoutes from "./admin.coupon.route.js";
import paymentRoutes from "./payment.route.js";

const router = Router();

router.get("/health", (request, response) => {
  response.json({ ok: true });
});

router.use("/auth", authRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/cart", cartRoutes);
router.use("/orders", orderRoutes);
router.use("/user", userRoutes);
router.use("/wishlist", wishlistRoutes);
router.use("/coupons", couponRoutes);
router.use("/banners", bannerRoutes);
router.use("/blogs", blogRoutes);
router.use("/admin", adminRoutes);
router.use("/admin/coupons", adminCouponRoutes);
router.use("/payments", paymentRoutes);

export default router;
