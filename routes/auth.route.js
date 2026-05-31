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

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", optionalAuth, resetPassword);
router.post("/verify", verifyAccount);
router.post("/resend-verify", resendVerification);
router.post("/refresh", refreshTokens);
router.post("/logout", logout);
router.get("/me", protect, getMe);

export default router;
