import bcrypt from "bcryptjs";
import crypto from "crypto";

import UserModel from "../models/user.model.js";
import AddressModel from "../models/address.model.js";
import RefreshTokenModel from "../models/refreshToken.model.js";
import OrderModel from "../models/order.model.js";
import NotificationModel from "../models/notification.model.js";
import TicketModel from "../models/ticket.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  formatAddress,
  formatOrder,
  formatProfile,
} from "../utils/formatters.js";
import { ApiError } from "../utils/apiError.js";
import {
  assertEmailSent,
  isEmailConfigured,
  sendEmailChangeVerificationEmail,
  sendLicenseKeysEmail,
} from "../utils/email.js";

function createOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function hashOtp(email, otp) {
  return crypto
    .createHash("sha256")
    .update(`${String(email).trim().toLowerCase()}:${String(otp).trim()}`)
    .digest("hex");
}

async function createNotification(userId, payload) {
  return NotificationModel.create({
    user: userId,
    type: payload.type || "account",
    title: payload.title,
    message: payload.message || "",
    data: payload.data || {},
  });
}

export const getProfile = asyncHandler(async (request, response) => {
  response.json(formatProfile(request.user));
});

export const updateProfile = asyncHandler(async (request, response) => {
  const { name, phone, avatar, dateOfBirth, gender } = request.body;
  const user = request.user;

  if (name?.trim()) {
    user.name = name.trim();
  }

  if (phone !== undefined) {
    user.mobile = String(phone).trim();
  }

  if (avatar !== undefined) {
    user.avatar = String(avatar || "").trim();
  }

  if (dateOfBirth !== undefined) {
    user.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
  }

  if (gender !== undefined) {
    user.gender = ["male", "female", "other"].includes(gender) ? gender : "";
  }

  await user.save();

  response.json(formatProfile(user));
});

export const requestEmailChange = asyncHandler(async (request, response) => {
  const nextEmail = String(request.body.email || "").trim().toLowerCase();

  if (!nextEmail || !/\S+@\S+\.\S+/.test(nextEmail)) {
    throw new ApiError(400, "Valid email is required");
  }

  if (nextEmail === request.user.email) {
    throw new ApiError(400, "New email must be different");
  }

  const exists = await UserModel.findOne({
    email: nextEmail,
    _id: { $ne: request.user._id },
  });

  if (exists) {
    throw new ApiError(409, "Email already in use");
  }

  if (!isEmailConfigured()) {
    throw new ApiError(503, "Server email is not configured");
  }

  const otp = createOtp();
  request.user.email_change_new = nextEmail;
  request.user.email_change_otp_hash = hashOtp(nextEmail, otp);
  request.user.email_change_expiry = new Date(Date.now() + 15 * 60 * 1000);
  await request.user.save();

  const mailResult = await sendEmailChangeVerificationEmail({
    to: nextEmail,
    name: request.user.name,
    otp,
  });

  assertEmailSent(mailResult);

  response.json({
    message: "Verification code sent to new email",
    pendingEmail: nextEmail,
  });
});

export const verifyEmailChange = asyncHandler(async (request, response) => {
  const otp = String(request.body.otp || "").trim();
  const user = request.user;

  if (!user.email_change_new || !user.email_change_otp_hash) {
    throw new ApiError(400, "No pending email change");
  }

  if (!otp || user.email_change_expiry < new Date()) {
    throw new ApiError(400, "Invalid or expired verification code");
  }

  if (hashOtp(user.email_change_new, otp) !== user.email_change_otp_hash) {
    throw new ApiError(400, "Invalid or expired verification code");
  }

  const exists = await UserModel.findOne({
    email: user.email_change_new,
    _id: { $ne: user._id },
  });

  if (exists) {
    throw new ApiError(409, "Email already in use");
  }

  user.email = user.email_change_new;
  user.verify_email = true;
  user.email_change_new = null;
  user.email_change_otp_hash = null;
  user.email_change_expiry = null;
  await user.save();

  await createNotification(user._id, {
    title: "Email updated",
    message: "Your account email was changed successfully.",
  });

  response.json(formatProfile(user));
});

export const changePassword = asyncHandler(async (request, response) => {
  const { password, confirmPassword, currentPassword } = request.body;

  if (!password || password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }

  const user = await UserModel.findById(request.user._id).select("+password");

  if (user.password) {
    if (!currentPassword) {
      throw new ApiError(400, "Current password is required");
    }

    const matches = await bcrypt.compare(currentPassword, user.password);

    if (!matches) {
      throw new ApiError(400, "Current password is incorrect");
    }
  }

  user.password = await bcrypt.hash(password, 10);
  user.lastPasswordChangeAt = new Date();
  await user.save();

  await createNotification(user._id, {
    type: "security",
    title: "Password changed",
    message: "Your account password was changed.",
  });

  response.json({ message: "Password changed successfully" });
});

export const getAddresses = asyncHandler(async (request, response) => {
  const addresses = await AddressModel.find({
    userId: request.user._id,
    status: true,
  }).sort({ isDefault: -1, createdAt: -1 });

  response.json(addresses.map(formatAddress));
});

export const createAddress = asyncHandler(async (request, response) => {
  const {
    label,
    fullName,
    address_line,
    city,
    state,
    pincode,
    country,
    province,
    district,
    ward,
    isDefault,
  } = request.body;

  if (!address_line?.trim() || !city?.trim()) {
    throw new ApiError(400, "Address line and city are required");
  }

  const hasAddress = await AddressModel.exists({
    userId: request.user._id,
    status: true,
  });
  const shouldBeDefault = Boolean(isDefault) || !hasAddress;

  if (shouldBeDefault) {
    await AddressModel.updateMany(
      { userId: request.user._id },
      { isDefault: false },
    );
  }

  const address = await AddressModel.create({
    userId: request.user._id,
    label: label?.trim() || "",
    fullName: fullName?.trim() || request.user.name || "",
    address_line: address_line.trim(),
    city: city.trim(),
    state: state?.trim() || "",
    pincode: pincode?.trim() || "",
    country: country?.trim() || "",
    mobile: request.user.mobile || "",
    province: province?.trim() || "",
    district: district?.trim() || "",
    ward: ward?.trim() || "",
    isDefault: shouldBeDefault,
  });

  response.status(201).json(formatAddress(address));
});

export const updateAddress = asyncHandler(async (request, response) => {
  const updates = { ...request.body };

  if (updates.isDefault === true) {
    await AddressModel.updateMany(
      { userId: request.user._id },
      { isDefault: false },
    );
  }

  const address = await AddressModel.findOneAndUpdate(
    { _id: request.params.id, userId: request.user._id },
    updates,
    { new: true },
  );

  if (!address) {
    throw new ApiError(404, "Address not found");
  }

  response.json(formatAddress(address));
});

export const setDefaultAddress = asyncHandler(async (request, response) => {
  const address = await AddressModel.findOne({
    _id: request.params.id,
    userId: request.user._id,
    status: true,
  });

  if (!address) {
    throw new ApiError(404, "Address not found");
  }

  await AddressModel.updateMany(
    { userId: request.user._id },
    { isDefault: false },
  );

  address.isDefault = true;
  await address.save();

  response.json(formatAddress(address));
});

export const deleteAddress = asyncHandler(async (request, response) => {
  const address = await AddressModel.findOneAndUpdate(
    { _id: request.params.id, userId: request.user._id },
    { status: false, isDefault: false },
    { new: true },
  );

  if (!address) {
    throw new ApiError(404, "Address not found");
  }

  response.json({ message: "Address removed" });
});

export const getSessions = asyncHandler(async (request, response) => {
  const sessions = await RefreshTokenModel.find({
    user: request.user._id,
    expiresAt: { $gt: new Date() },
  }).sort({ lastUsedAt: -1 });

  response.json(
    sessions.map((session) => ({
      id: session._id,
      deviceName: session.deviceName || "Browser",
      ipAddress: session.ipAddress || "",
      userAgent: session.userAgent || "",
      lastUsedAt: session.lastUsedAt,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    })),
  );
});

export const deleteSession = asyncHandler(async (request, response) => {
  await RefreshTokenModel.deleteOne({
    _id: request.params.id,
    user: request.user._id,
  });

  response.json({ message: "Session removed" });
});

export const deleteAllSessions = asyncHandler(async (request, response) => {
  await RefreshTokenModel.deleteMany({ user: request.user._id });
  response.json({ message: "All sessions removed" });
});

function collectLicenseEntries(orders) {
  const entries = [];

  orders.forEach((order) => {
    const formatted = formatOrder(order);

    formatted.items
      .filter((item) => item.licenseKeys?.length)
      .forEach((item) => {
        entries.push({
          id: `${formatted.id}-${item.productId}`,
          orderId: formatted.id,
          productId: item.productId,
          productName:
            item.product?.name || item.product?.title || `Product ${item.productId}`,
          thumbnail: item.product?.thumbnail || item.product?.image || "",
          keys: item.licenseKeys,
          createdAt: formatted.createdAt,
        });
      });
  });

  return entries;
}

export const getLicenses = asyncHandler(async (request, response) => {
  const orders = await OrderModel.find({
    email: request.user.email,
    paymentStatus: "paid",
    "items.licenseKeys.0": { $exists: true },
  }).sort({ createdAt: -1 });

  response.json(collectLicenseEntries(orders));
});

export const resendLicenseKeys = asyncHandler(async (request, response) => {
  const order = await OrderModel.findOne({
    orderId: request.params.orderId,
    email: request.user.email,
    paymentStatus: "paid",
    "items.licenseKeys.0": { $exists: true },
  });

  if (!order) {
    throw new ApiError(404, "License order not found");
  }

  const keys = collectLicenseEntries([order]).map((entry) => ({
    productName: entry.productName,
    keys: entry.keys,
  }));

  const mailResult = await sendLicenseKeysEmail({
    to: request.user.email,
    name: request.user.name,
    orderId: order.orderId,
    keys,
  });

  assertEmailSent(mailResult);

  response.json({ message: "License keys resent" });
});

export const getNotifications = asyncHandler(async (request, response) => {
  const notifications = await NotificationModel.find({
    user: request.user._id,
  }).sort({ createdAt: -1 });

  response.json(
    notifications.map((item) => ({
      id: item._id,
      type: item.type,
      title: item.title,
      message: item.message,
      readAt: item.readAt,
      data: item.data,
      createdAt: item.createdAt,
    })),
  );
});

export const markNotificationRead = asyncHandler(async (request, response) => {
  const notification = await NotificationModel.findOneAndUpdate(
    { _id: request.params.id, user: request.user._id },
    { readAt: new Date() },
    { new: true },
  );

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  response.json({ message: "Notification marked as read" });
});

export const markAllNotificationsRead = asyncHandler(async (request, response) => {
  await NotificationModel.updateMany(
    { user: request.user._id, readAt: null },
    { readAt: new Date() },
  );

  response.json({ message: "Notifications marked as read" });
});

function formatTicket(ticket) {
  return {
    id: ticket._id,
    orderId: ticket.orderId,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    priority: ticket.priority,
    replies: (ticket.replies || []).map((reply) => ({
      id: reply._id,
      authorRole: reply.authorRole,
      message: reply.message,
      createdAt: reply.createdAt,
    })),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

export const getTickets = asyncHandler(async (request, response) => {
  const tickets = await TicketModel.find({ user: request.user._id }).sort({
    updatedAt: -1,
  });

  response.json(tickets.map(formatTicket));
});

export const createTicket = asyncHandler(async (request, response) => {
  const subject = String(request.body.subject || "").trim();
  const message = String(request.body.message || "").trim();

  if (!subject || !message) {
    throw new ApiError(400, "Subject and message are required");
  }

  const ticket = await TicketModel.create({
    user: request.user._id,
    orderId: String(request.body.orderId || "").trim(),
    subject,
    message,
    priority: request.body.priority || "normal",
  });

  await createNotification(request.user._id, {
    type: "support",
    title: "Support ticket created",
    message: `Ticket "${ticket.subject}" was created.`,
    data: { ticketId: ticket._id },
  });

  response.status(201).json(formatTicket(ticket));
});

export const getTicketById = asyncHandler(async (request, response) => {
  const ticket = await TicketModel.findOne({
    _id: request.params.id,
    user: request.user._id,
  });

  if (!ticket) {
    throw new ApiError(404, "Ticket not found");
  }

  response.json(formatTicket(ticket));
});

export const addTicketReply = asyncHandler(async (request, response) => {
  const message = String(request.body.message || "").trim();

  if (!message) {
    throw new ApiError(400, "Reply message is required");
  }

  const ticket = await TicketModel.findOne({
    _id: request.params.id,
    user: request.user._id,
  });

  if (!ticket) {
    throw new ApiError(404, "Ticket not found");
  }

  ticket.replies.push({
    author: request.user._id,
    authorRole: request.user.role,
    message,
  });
  ticket.status = "pending";
  await ticket.save();

  response.status(201).json(formatTicket(ticket));
});
