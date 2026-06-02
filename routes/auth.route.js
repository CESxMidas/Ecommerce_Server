import { Router } from "express";

import {
  forgotPassword,
  getMe,
  googleLogin,
  login,
  logout,
  refreshTokens,
  register,
  resendVerification,
  resetPassword,
  verifyAccount,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { optionalAuth } from "../middleware/optionalAuth.middleware.js";
import { authRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/register", authRateLimiter, register);
router.post("/login", authRateLimiter, login);
router.post("/google", authRateLimiter, googleLogin);
router.post("/forgot-password", authRateLimiter, forgotPassword);
router.post("/reset-password", authRateLimiter, optionalAuth, resetPassword);
router.post("/verify", authRateLimiter, verifyAccount);
router.post("/resend-verify", authRateLimiter, resendVerification);
router.post("/refresh", refreshTokens);
router.post("/logout", logout);
router.get("/me", protect, getMe);

export default router;
