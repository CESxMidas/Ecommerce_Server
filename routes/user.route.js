import { Router } from "express";

import {
  changePassword,
  createAddress,
  createTicket,
  deleteAddress,
  deleteAllSessions,
  deleteSession,
  getLicenses,
  getNotifications,
  getAddresses,
  getProfile,
  getSessions,
  getTicketById,
  getTickets,
  markAllNotificationsRead,
  markNotificationRead,
  requestEmailChange,
  resendLicenseKeys,
  setDefaultAddress,
  addTicketReply,
  updateAddress,
  updateProfile,
  verifyEmailChange,
} from "../controllers/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.use(protect);

router.get("/profile", getProfile);
router.patch("/profile", updateProfile);
router.post("/profile/password", changePassword);
router.post("/profile/email/request", requestEmailChange);
router.post("/profile/email/verify", verifyEmailChange);

router.get("/addresses", getAddresses);
router.post("/addresses", createAddress);
router.patch("/addresses/:id", updateAddress);
router.patch("/addresses/:id/default", setDefaultAddress);
router.delete("/addresses/:id", deleteAddress);

router.get("/sessions", getSessions);
router.delete("/sessions", deleteAllSessions);
router.delete("/sessions/:id", deleteSession);

router.get("/licenses", getLicenses);
router.post("/licenses/:orderId/resend", resendLicenseKeys);

router.get("/notifications", getNotifications);
router.patch("/notifications/read-all", markAllNotificationsRead);
router.patch("/notifications/:id/read", markNotificationRead);

router.get("/tickets", getTickets);
router.post("/tickets", createTicket);
router.get("/tickets/:id", getTicketById);
router.post("/tickets/:id/replies", addTicketReply);

export default router;
