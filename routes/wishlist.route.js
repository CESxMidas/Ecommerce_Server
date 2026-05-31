import { Router } from "express";

import {
  addToWishlist,
  getWishlist,
  removeFromWishlist,
  replaceWishlist,
} from "../controllers/wishlist.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.use(protect);

router.get("/", getWishlist);
router.put("/", replaceWishlist);
router.post("/", addToWishlist);
router.delete("/:id", removeFromWishlist);

export default router;
