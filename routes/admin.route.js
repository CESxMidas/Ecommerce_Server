import { Router } from "express";

import {
  adminGetBanners,
  createBanner,
  deleteBanner,
  updateBanner,
} from "../controllers/banner.controller.js";
import {
  adminGetBlogs,
  createBlog,
  deleteBlog,
  updateBlog,
} from "../controllers/blog.controller.js";
import { getDashboardStats } from "../controllers/admin.controller.js";
import {
  uploadImage,
  uploadMiddleware,
} from "../controllers/upload.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { adminOnly } from "../middleware/admin.middleware.js";

const router = Router();

router.use(protect, adminOnly);

router.get("/stats", getDashboardStats);

router.get("/banners", adminGetBanners);
router.post("/banners", createBanner);
router.put("/banners/:id", updateBanner);
router.delete("/banners/:id", deleteBanner);

router.get("/blogs", adminGetBlogs);
router.post("/blogs", createBlog);
router.put("/blogs/:id", updateBlog);
router.delete("/blogs/:id", deleteBlog);

router.post("/upload", uploadMiddleware, uploadImage);

export default router;
