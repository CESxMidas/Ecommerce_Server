import crypto from "crypto";
import jwt from "jsonwebtoken";
import RefreshTokenModel from "../models/refreshToken.model.js";

const REFRESH_DAYS = Number(process.env.JWT_REFRESH_DAYS || 30);

export function generateAccessToken(userId) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "1h",
  });
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueRefreshToken(userId, metadata = {}) {
  const rawToken = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);

  await RefreshTokenModel.create({
    user: userId,
    tokenHash: hashToken(rawToken),
    deviceName: metadata.deviceName || "",
    ipAddress: metadata.ipAddress || "",
    userAgent: metadata.userAgent || "",
    lastUsedAt: new Date(),
    expiresAt,
  });

  return rawToken;
}

export async function rotateRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const stored = await RefreshTokenModel.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() },
  });

  if (!stored) {
    return null;
  }

  const metadata = {
    deviceName: stored.deviceName,
    ipAddress: stored.ipAddress,
    userAgent: stored.userAgent,
  };

  await RefreshTokenModel.deleteOne({ _id: stored._id });

  const accessToken = generateAccessToken(stored.user);
  const refreshToken = await issueRefreshToken(stored.user, metadata);

  return { userId: stored.user, accessToken, refreshToken };
}

export async function revokeRefreshToken(rawToken) {
  if (!rawToken) {
    return;
  }

  await RefreshTokenModel.deleteOne({ tokenHash: hashToken(rawToken) });
}

export async function revokeAllUserRefreshTokens(userId) {
  await RefreshTokenModel.deleteMany({ user: userId });
}
