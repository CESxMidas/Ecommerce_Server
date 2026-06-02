import test from "node:test";
import assert from "node:assert/strict";

import {
  ORDER_STATUS,
  assertTransitionAllowed,
  getInitialOrderStatus,
} from "../utils/orderLifecycle.js";

test("order status machine starts VNPay orders in PendingPayment", () => {
  assert.equal(getInitialOrderStatus("vnpay", "pending"), "PendingPayment");
});

test("order status machine starts COD orders in Processing", () => {
  assert.equal(getInitialOrderStatus("cod", "awaiting_cod"), "Processing");
});

test("user can cancel only cancellable states", () => {
  assert.equal(
    assertTransitionAllowed(
      ORDER_STATUS.PENDING_PAYMENT,
      ORDER_STATUS.CANCELLED,
      false,
    ),
    ORDER_STATUS.CANCELLED,
  );

  assert.throws(() =>
    assertTransitionAllowed(
      ORDER_STATUS.DELIVERED,
      ORDER_STATUS.CANCELLED,
      false,
    ),
  );
});

test("admin transitions must follow the status machine", () => {
  assert.equal(
    assertTransitionAllowed(
      ORDER_STATUS.PROCESSING,
      ORDER_STATUS.SHIPPED,
      true,
    ),
    ORDER_STATUS.SHIPPED,
  );

  assert.throws(() =>
    assertTransitionAllowed(
      ORDER_STATUS.DELIVERED,
      ORDER_STATUS.PROCESSING,
      true,
    ),
  );
});
