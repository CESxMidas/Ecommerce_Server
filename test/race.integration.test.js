import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import CouponModel from "../models/coupon.model.js";
import ProductModel from "../models/product.model.js";
import { claimCouponUsage } from "../utils/couponHelpers.js";
import { decrementStockForItems } from "../utils/orderLifecycle.js";

const mongoUrl = process.env.TEST_MONGODB_URL;

test("coupon usage claim is atomic under concurrent requests", { skip: !mongoUrl }, async () => {
  await mongoose.connect(mongoUrl);
  await CouponModel.deleteMany({ code: "RACE1" });

  const coupon = await CouponModel.create({
    code: "RACE1",
    type: "fixed",
    value: 1,
    usageLimit: 1,
  });

  const results = await Promise.allSettled([
    claimCouponUsage(coupon),
    claimCouponUsage(coupon),
  ]);
  const successes = results.filter((result) => result.status === "fulfilled");
  const updated = await CouponModel.findOne({ code: "RACE1" });

  assert.equal(successes.length, 1);
  assert.equal(updated.usedCount, 1);

  await mongoose.disconnect();
});

test("stock decrement is atomic under concurrent requests", { skip: !mongoUrl }, async () => {
  await mongoose.connect(mongoUrl);
  await ProductModel.deleteMany({ productId: 999001 });

  await ProductModel.create({
    productId: 999001,
    name: "Race Product",
    slug: "race-product",
    price: 10,
    stock: 1,
  });

  const item = { productId: 999001, quantity: 1 };
  const results = await Promise.allSettled([
    decrementStockForItems([item]),
    decrementStockForItems([item]),
  ]);
  const successes = results.filter((result) => result.status === "fulfilled");
  const updated = await ProductModel.findOne({ productId: 999001 });

  assert.equal(successes.length, 1);
  assert.equal(updated.stock, 0);

  await mongoose.disconnect();
});
