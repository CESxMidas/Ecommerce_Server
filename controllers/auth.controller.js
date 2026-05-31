import bcrypt from "bcryptjs";
import crypto from "crypto";
import UserModel from "../models/user.model.js";
import { generateToken } from "../utils/generateToken.js";
import {
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../utils/refreshToken.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatAuthUser } from "../utils/formatters.js";
import { ApiError, throwIfInvalid } from "../utils/apiError.js";
import {
  assertEmailSent,
  isEmailConfigured,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../utils/email.js";

import {
  validateForgotPassword,
  validateLogin,
  validateRegister,
  validateResetPassword,
  validateVerify,
} from "../validators/auth.validator.js";
import {
  verifyGoogleIdToken,
  getGoogleClientIds,
} from "../utils/googleAuth.js";

function createOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function getSessionMetadata(request) {
  return {
    deviceName:
      request.headers["x-device-name"] ||
      request.headers["user-agent"]?.split(" ").slice(0, 3).join(" ") ||
      "Browser",
    ipAddress: request.ip || request.socket?.remoteAddress || "",
    userAgent: request.headers["user-agent"] || "",
  };
}

async function sendAuthResponse(user, request, response, statusCode = 200) {
  const token = generateToken(user._id);
  const refreshToken = await issueRefreshToken(
    user._id,
    getSessionMetadata(request),
  );

  const payload = {
    ...formatAuthUser(user, token),
    refreshToken,
  };

  response.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: Number(process.env.JWT_REFRESH_DAYS || 30) * 24 * 60 * 60 * 1000,
  });

  response.status(statusCode).json(payload);
}

async function saveOtpAndSendVerification(user, otp) {
  user.forgot_password_otp = otp;

  user.forgot_password_expiry = new Date(Date.now() + 15 * 60 * 1000);

  await user.save();

  const mailResult = await sendVerificationEmail({
    to: user.email,

    name: user.name,

    otp,
  });

  assertEmailSent(mailResult);

  return mailResult;
}

async function saveOtpAndSendPasswordReset(user, otp) {
  user.forgot_password_otp = otp;

  user.forgot_password_expiry = new Date(Date.now() + 15 * 60 * 1000);

  await user.save();

  const mailResult = await sendPasswordResetEmail({
    to: user.email,

    name: user.name,

    otp,
  });

  assertEmailSent(mailResult);

  return mailResult;
}

export const register = asyncHandler(async (request, response) => {
  throwIfInvalid(validateRegister(request.body));

  if (!isEmailConfigured()) {
    throw new ApiError(
      503,

      "Server chưa cấu hình Gmail. Thêm GMAIL_USER và GMAIL_APP_PASSWORD vào file .env",
    );
  }

  const { name, email, password } = request.body;

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await UserModel.findOne({ email: normalizedEmail });

  if (existingUser) {
    throw new ApiError(409, "Email already registered");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const verifyOtp = createOtp();

  const user = await UserModel.create({
    name: name.trim(),

    email: normalizedEmail,

    password: hashedPassword,

    forgot_password_otp: verifyOtp,

    forgot_password_expiry: new Date(Date.now() + 15 * 60 * 1000),
  });

  try {
    const mailResult = await sendVerificationEmail({
      to: user.email,

      name: user.name,

      otp: verifyOtp,
    });

    assertEmailSent(mailResult);
  } catch (error) {
    await UserModel.deleteOne({ _id: user._id });

    throw new ApiError(
      502,

      error.message || "Không gửi được email xác minh",
    );
  }

  response.status(201).json({
    message:
      "Đăng ký thành công. Mã xác minh đã gửi tới Gmail — kiểm tra hộp thư (và Spam).",

    name: user.name,

    email: user.email,

    emailSent: true,
  });
});

export const login = asyncHandler(async (request, response) => {
  throwIfInvalid(validateLogin(request.body));

  const { email, password } = request.body;

  const user = await UserModel.findOne({
    email: email.trim().toLowerCase(),
  }).select("+password");

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (user.status !== "Active") {
    throw new ApiError(403, "Account is not active");
  }

  if (!user.password) {
    throw new ApiError(400, "Tài khoản này đăng nhập bằng Google");
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (user.authProvider === "local" && !user.verify_email) {
    let emailSent = false;
    let sendErrorMessage = "";

    if (isEmailConfigured()) {
      const verifyOtp = createOtp();

      try {
        await saveOtpAndSendVerification(user, verifyOtp);
        emailSent = true;
      } catch (error) {
        sendErrorMessage =
          error.message || "Khong gui duoc email xac minh";
      }
    } else {
      sendErrorMessage = "Server chua cau hinh Gmail";
    }

    throw new ApiError(
      403,
      emailSent
        ? "Vui lòng xác minh email trước khi đăng nhập. Mã xác minh mới đã được gửi tới Gmail."
        : "Vui lòng xác minh email trước khi đăng nhập. Không gửi được mã mới, vui lòng bấm gửi lại mã.",
      {
        code: "EMAIL_NOT_VERIFIED",
        email: user.email,
        emailSent,
        ...(sendErrorMessage ? { sendError: sendErrorMessage } : {}),
      },
    );
  }

  user.last_login_date = new Date();

  await user.save();

  await sendAuthResponse(user, request, response);
});

export const refreshTokens = asyncHandler(async (request, response) => {
  const rawToken =
    request.body.refreshToken || request.cookies?.refreshToken;

  if (!rawToken) {
    throw new ApiError(401, "Refresh token is required");
  }

  const rotated = await rotateRefreshToken(rawToken);

  if (!rotated) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await UserModel.findById(rotated.userId);

  if (!user || user.status !== "Active") {
    throw new ApiError(401, "User not found");
  }

  response.cookie("refreshToken", rotated.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: Number(process.env.JWT_REFRESH_DAYS || 30) * 24 * 60 * 60 * 1000,
  });

  response.json({
    ...formatAuthUser(user, rotated.accessToken),
    refreshToken: rotated.refreshToken,
  });
});

export const logout = asyncHandler(async (request, response) => {
  const rawToken =
    request.body.refreshToken || request.cookies?.refreshToken;

  await revokeRefreshToken(rawToken);

  response.clearCookie("refreshToken");
  response.json({ message: "Logged out successfully" });
});

export const forgotPassword = asyncHandler(async (request, response) => {
  throwIfInvalid(validateForgotPassword(request.body));

  if (!isEmailConfigured()) {
    throw new ApiError(
      503,

      "Server chưa cấu hình Gmail. Thêm GMAIL_USER và GMAIL_APP_PASSWORD vào file .env",
    );
  }

  const { email } = request.body;

  const user = await UserModel.findOne({
    email: email.trim().toLowerCase(),
  });

  if (!user) {
    return response.json({
      email,

      message: "Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi",

      emailSent: true,
    });
  }

  const otp = createOtp();

  try {
    await saveOtpAndSendPasswordReset(user, otp);
  } catch (error) {
    throw new ApiError(
      502,

      error.message || "Không gửi được email đặt lại mật khẩu",
    );
  }

  response.json({
    email: user.email,

    message:
      "Mã đặt lại mật khẩu đã gửi tới Gmail — kiểm tra hộp thư (và Spam).",

    emailSent: true,
  });
});

export const resendVerification = asyncHandler(async (request, response) => {
  const { email } = request.body;

  if (!email?.trim()) {
    throw new ApiError(400, "Email is required");
  }

  if (!isEmailConfigured()) {
    throw new ApiError(
      503,

      "Server chưa cấu hình Gmail. Thêm GMAIL_USER và GMAIL_APP_PASSWORD vào file .env",
    );
  }

  const user = await UserModel.findOne({
    email: email.trim().toLowerCase(),
  });

  if (!user) {
    return response.json({
      message: "Nếu email tồn tại, mã xác minh đã được gửi",

      emailSent: true,
    });
  }

  if (user.verify_email) {
    return response.json({
      message: "Email đã được xác minh trước đó",

      emailSent: false,
    });
  }

  const otp = createOtp();

  try {
    await saveOtpAndSendVerification(user, otp);
  } catch (error) {
    throw new ApiError(
      502,

      error.message || "Không gửi được email xác minh",
    );
  }

  response.json({
    message: "Mã xác minh đã gửi lại tới Gmail — kiểm tra hộp thư (và Spam).",

    emailSent: true,
  });
});

export const resetPassword = asyncHandler(async (request, response) => {
  throwIfInvalid(validateResetPassword(request.body));

  const { password, email, otp } = request.body;

  let user = null;

  if (request.user) {
    user = request.user;
  } else if (email && otp) {
    user = await UserModel.findOne({
      email: email.trim().toLowerCase(),

      forgot_password_otp: String(otp).trim(),

      forgot_password_expiry: { $gt: new Date() },
    });
  } else {
    throw new ApiError(
      400,

      "Provide email and OTP, or login before resetting password",
    );
  }

  if (!user) {
    throw new ApiError(400, "Invalid or expired reset code");
  }

  user.password = await bcrypt.hash(password, 10);

  user.forgot_password_otp = null;

  user.forgot_password_expiry = null;

  await user.save();

  response.json({
    message: "Password reset successfully",
  });
});

export const verifyAccount = asyncHandler(async (request, response) => {
  throwIfInvalid(validateVerify(request.body));

  const { email, otp } = request.body;

  const user = await UserModel.findOne({
    email: email.trim().toLowerCase(),

    forgot_password_otp: String(otp).trim(),

    forgot_password_expiry: { $gt: new Date() },
  });

  if (!user) {
    throw new ApiError(400, "Invalid or expired verification code");
  }

  user.verify_email = true;

  user.forgot_password_otp = null;

  user.forgot_password_expiry = null;

  await user.save();

  response.json({
    message: "Account verified successfully",

    email: user.email,
  });
});

export const googleLogin = asyncHandler(async (request, response) => {
  const { credential, clientId } = request.body;

  const idToken = credential?.trim();

  if (!idToken) {
    throw new ApiError(400, "Google credential is required");
  }
  const configuredIds = getGoogleClientIds();

  if (configuredIds.length === 0 && !clientId?.trim()) {
    throw new ApiError(
      503,

      "Google login chưa cấu hình. Thêm GOOGLE_CLIENT_ID vào file .env",
    );
  }

  let profile;

  try {
    profile = await verifyGoogleIdToken(idToken, clientId);
  } catch (error) {
    const detail =
      process.env.NODE_ENV !== "production"
        ? error.message
        : "Google token không hợp lệ";

    throw new ApiError(401, detail);
  }

  if (!profile.email) {
    throw new ApiError(400, "Google account has no email");
  }

  if (!profile.emailVerified) {
    throw new ApiError(400, "Email Google chưa được xác minh");
  }

  const normalizedEmail = profile.email;

  let user = await UserModel.findOne({
    $or: [{ googleId: profile.googleId }, { email: normalizedEmail }],
  }).select("+password");

  if (user) {
    if (user.googleId && user.googleId !== profile.googleId) {
      throw new ApiError(409, "Email đã liên kết tài khoản Google khác");
    }

    if (!user.googleId) {
      user.googleId = profile.googleId;

      user.authProvider = "google";
    }

    if (profile.picture) {
      user.avatar = profile.picture;
    }

    user.verify_email = true;

    user.last_login_date = new Date();

    await user.save();
  } else {
    user = await UserModel.create({
      name: profile.name,

      email: normalizedEmail,

      googleId: profile.googleId,

      authProvider: "google",

      avatar: profile.picture || "",

      verify_email: true,
    });
  }

  await sendAuthResponse(user, request, response);
});

export const getMe = asyncHandler(async (request, response) => {
  const user = request.user;

  response.json({
    _id: user._id,

    name: user.name,

    email: user.email,

    phone: user.mobile || "",

    avatar: user.avatar,

    role: user.role,

    verify_email: user.verify_email,

    phoneVerified: Boolean(user.phoneVerified),

    dateOfBirth: user.dateOfBirth,

    gender: user.gender || "",

    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  });
});
