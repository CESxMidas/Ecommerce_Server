import CouponModel from "../models/coupon.model.js";
import { ApiError } from "./apiError.js";

export async function validateCoupon(code, subtotal) {
  if (!code?.trim()) {
    throw new ApiError(400, "Coupon code is required");
  }

  const coupon = await CouponModel.findOne({
    code: code.trim().toUpperCase(),
    isActive: true,
  });

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

export async function incrementCouponUsage(couponId) {
  await CouponModel.updateOne({ _id: couponId }, { $inc: { usedCount: 1 } });
}
