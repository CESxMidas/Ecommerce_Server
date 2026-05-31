import jwt from "jsonwebtoken";

export { generateAccessToken } from "./refreshToken.js";

export function generateToken(userId) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || process.env.JWT_ACCESS_EXPIRES_IN || "1h",
  });
}
