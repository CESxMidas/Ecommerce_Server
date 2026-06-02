import test from "node:test";
import assert from "node:assert/strict";

import {
  validateLogin,
  validateRegister,
} from "../validators/auth.validator.js";
import { validatePlaceOrder } from "../validators/order.validator.js";

test("auth validation accepts valid register payload", () => {
  assert.deepEqual(
    validateRegister({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "secret1",
    }),
    [],
  );
});

test("auth validation rejects weak login/register payloads", () => {
  assert.ok(validateLogin({ email: "", password: "" }).length >= 2);
  assert.ok(
    validateRegister({
      name: "",
      email: "bad-email",
      password: "123",
    }).length >= 3,
  );
});

test("order validation requires valid items", () => {
  assert.deepEqual(
    validatePlaceOrder({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+84901234567",
      address: "1 Main St",
      items: [{ productId: 1, quantity: 2 }],
    }),
    [],
  );

  assert.ok(
    validatePlaceOrder({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+84901234567",
      address: "1 Main St",
      items: [{ productId: 1, quantity: 0 }],
    }).includes("Quantity must be at least 1"),
  );
});
