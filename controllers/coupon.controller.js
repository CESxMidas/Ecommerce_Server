import CouponModel from "../models/coupon.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validateCoupon } from "../utils/couponHelpers.js";
import { ApiError, throwIfInvalid } from "../utils/apiError.js";
import { validateCouponPayload } from "../validators/schema.validator.js";

export const validateCouponCode = asyncHandler(async (request, response) => {
  const { code, subtotal } = request.body;

  const result = await validateCoupon(code, subtotal);

  response.json({
    code: result.coupon.code,
    type: result.coupon.type,
    value: result.coupon.value,
    discount: result.discount,
    subtotal: result.subtotal,
    total: result.total,
  });
});

export const getCoupons = asyncHandler(async (request, response) => {
  const coupons = await CouponModel.find().sort({ createdAt: -1 });
  response.json(coupons);
});

export const createCoupon = asyncHandler(async (request, response) => {
  throwIfInvalid(validateCouponPayload(request.body));

  const { code, type, value, minOrder, maxDiscount, usageLimit, expiresAt } =
    request.body;

  if (!code?.trim()) {
    throw new ApiError(400, "Coupon code is required");
  }

  const coupon = await CouponModel.create({
    code: code.trim().toUpperCase(),
    type: type || "percent",
    value: Number(value) || 0,
    minOrder: Number(minOrder) || 0,
    maxDiscount: maxDiscount != null ? Number(maxDiscount) : null,
    usageLimit: usageLimit != null ? Number(usageLimit) : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });

  response.status(201).json(coupon);
});

export const updateCoupon = asyncHandler(async (request, response) => {
  throwIfInvalid(validateCouponPayload(request.body, { partial: true }));

  const coupon = await CouponModel.findByIdAndUpdate(
    request.params.id,
    request.body,
    { new: true },
  );

  if (!coupon) {
    throw new ApiError(404, "Coupon not found");
  }

  response.json(coupon);
});

export const deleteCoupon = asyncHandler(async (request, response) => {
  const coupon = await CouponModel.findByIdAndDelete(request.params.id);

  if (!coupon) {
    throw new ApiError(404, "Coupon not found");
  }

  response.json({ message: "Coupon deleted" });
});
