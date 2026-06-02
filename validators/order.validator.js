import { validateOrderPayload } from "./schema.validator.js";

export function validatePlaceOrder(body) {
  return validateOrderPayload(body || {});
}
