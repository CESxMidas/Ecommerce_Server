import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import CartModel from "../models/cart.model.js";
import OrderModel from "../models/order.model.js";
import PaymentModel from "../models/payment.model.js";
import ProductModel from "../models/product.model.js";
import UserModel from "../models/user.model.js";
import { getOrCreateCart } from "../utils/cartHelpers.js";
import { markPaymentPaid } from "../services/payment.service.js";

const mongoUrl = process.env.TEST_MONGODB_URL;

test("cart persistence stores one cart per user", { skip: !mongoUrl }, async () => {
  await mongoose.connect(mongoUrl);
  await Promise.all([
    CartModel.deleteMany({}),
    UserModel.deleteMany({ email: "cart-test@example.com" }),
  ]);

  const user = await UserModel.create({
    name: "Cart Test",
    email: "cart-test@example.com",
    password: "secret",
    verify_email: true,
  });
  const first = await getOrCreateCart(user._id);
  const second = await getOrCreateCart(user._id);

  assert.equal(String(first._id), String(second._id));

  await mongoose.disconnect();
});

test("payment callback marks an order paid once", { skip: !mongoUrl }, async () => {
  await mongoose.connect(mongoUrl);
  await Promise.all([
    OrderModel.deleteMany({ orderId: "ORD-PAYMENT-TEST" }),
    PaymentModel.deleteMany({ orderId: "ORD-PAYMENT-TEST" }),
    ProductModel.deleteMany({ productId: 999002 }),
  ]);

  await ProductModel.create({
    productId: 999002,
    name: "Payment Race Product",
    slug: "payment-race-product",
    price: 10,
    stock: 2,
  });
  await PaymentModel.create({
    paymentId: "PAY-PAYMENT-TEST",
    orderId: "ORD-PAYMENT-TEST",
    provider: "vnpay",
    amount: 10,
    status: "pending",
  });
  await OrderModel.create({
    orderId: "ORD-PAYMENT-TEST",
    paymentId: "PAY-PAYMENT-TEST",
    name: "Payment Test",
    phone: "+84901234567",
    address: "1 Main St",
    total: 10,
    email: "payment-test@example.com",
    status: "PendingPayment",
    paymentMethod: "vnpay",
    paymentStatus: "pending",
    items: [
      {
        productId: 999002,
        quantity: 1,
        unitPrice: 10,
        lineTotal: 10,
        product: {
          id: 999002,
          name: "Payment Race Product",
          price: 10,
          productType: "hardware",
          deliveryType: "physical",
        },
      },
    ],
  });

  await markPaymentPaid({
    orderId: "ORD-PAYMENT-TEST",
    transactionId: "TXN-1",
    raw: { ok: true },
  });
  await markPaymentPaid({
    orderId: "ORD-PAYMENT-TEST",
    transactionId: "TXN-1",
    raw: { ok: true },
  });

  const [order, product] = await Promise.all([
    OrderModel.findOne({ orderId: "ORD-PAYMENT-TEST" }),
    ProductModel.findOne({ productId: 999002 }),
  ]);

  assert.equal(order.paymentStatus, "paid");
  assert.equal(order.stockDeducted, true);
  assert.equal(product.stock, 1);

  await mongoose.disconnect();
});
