import crypto from "crypto";
import { ApiError } from "./apiError.js";

const CSRF_COOKIE = "csrfToken";
const CSRF_HEADER = "x-csrf-token";

export function createCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function setCsrfCookie(response, token = createCsrfToken()) {
  response.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: Number(process.env.JWT_REFRESH_DAYS || 30) * 24 * 60 * 60 * 1000,
  });

  return token;
}

export function clearCsrfCookie(response) {
  response.clearCookie(CSRF_COOKIE);
}

export function assertCsrf(request) {
  const cookieToken = request.cookies?.[CSRF_COOKIE];
  const headerToken = request.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new ApiError(403, "Invalid CSRF token");
  }
}
