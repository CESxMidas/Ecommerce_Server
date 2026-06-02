import CouponModel from "../models/coupon.model.js";
import { ApiError } from "./apiError.js";

export async function validateCoupon(code, subtotal, options = {}) {
  if (!code?.trim()) {
    throw new ApiError(400, "Coupon code is required");
  }

  const coupon = await CouponModel.findOne({
    code: code.trim().toUpperCase(),
    isActive: true,
  }).session(options.session || null);

  if (!coupon) {
    throw new ApiError(404, "Invalid coupon code");
  }

  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new ApiError(400, "Coupon has expired");
  }

  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    throw new ApiError(400, "Coupon usage limit reached");
  }

  const orderSubtotal = Math.max(0, Number(subtotal) || 0);

  if (orderSubtotal < coupon.minOrder) {
    throw new ApiError(
      400,
      `Minimum order amount is $${coupon.minOrder} to use this coupon`,
    );
  }

  let discount = 0;

  if (coupon.type === "percent") {
    discount = (orderSubtotal * coupon.value) / 100;
  } else {
    discount = coupon.value;
  }

  if (coupon.maxDiscount != null) {
    discount = Math.min(discount, coupon.maxDiscount);
  }

  discount = Math.min(discount, orderSubtotal);

  return {
    coupon,
    discount: Math.round(discount * 100) / 100,
    subtotal: orderSubtotal,
    total: Math.max(0, orderSubtotal - discount),
  };
}

function buildUsageLimitFilter(coupon) {
  const filter = { _id: coupon._id, isActive: true };

  if (coupon.usageLimit != null) {
    filter.usedCount = { $lt: coupon.usageLimit };
  }

  return filter;
}

export async function claimCouponUsage(coupon, session = null) {
  if (!coupon?._id) {
    throw new ApiError(400, "Coupon is required");
  }

  const result = await CouponModel.updateOne(
    buildUsageLimitFilter(coupon),
    { $inc: { usedCount: 1 } },
    { session },
  );

  if (result.modifiedCount !== 1) {
    throw new ApiError(400, "Coupon usage limit reached");
  }

  return result;
}

export async function claimCouponUsageByCode(code, session = null) {
  if (!code?.trim()) {
    return null;
  }

  const coupon = await CouponModel.findOne({
    code: code.trim().toUpperCase(),
    isActive: true,
  }).session(session);

  if (!coupon) {
    throw new ApiError(404, "Invalid coupon code");
  }

  return claimCouponUsage(coupon, session);
}

export async function incrementCouponUsage(couponId) {
  const coupon = await CouponModel.findById(couponId);

  if (!coupon) {
    throw new ApiError(404, "Invalid coupon code");
  }

  await claimCouponUsage(coupon);
}

export async function incrementCouponUsageByCode(code) {
  return claimCouponUsageByCode(code);
}
