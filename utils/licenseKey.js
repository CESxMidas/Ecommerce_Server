import OrderModel from "../models/order.model.js";

export function randomFiveDigits() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

export function buildLicenseKey(prefix) {
  const normalizedPrefix = String(prefix || "KEY")
    .trim()
    .toUpperCase();

  return `${normalizedPrefix}-${randomFiveDigits()}`;
}

export async function generateUniqueLicenseKey(prefix, session = null) {
  const maxAttempts = 12;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const key = buildLicenseKey(prefix);
    const exists = await OrderModel.exists({ "items.licenseKeys": key }).session(
      session,
    );

    if (!exists) {
      return key;
    }
  }

  return `${String(prefix).toUpperCase()}-${Date.now().toString().slice(-5)}`;
}

export async function generateLicenseKeysForProduct(
  product,
  quantity = 1,
  session = null,
) {
  const canGenerateKey =
    ["license_key", "redeem_code"].includes(product?.productType) &&
    product?.deliveryType === "instant_key";

  if (!canGenerateKey || !product?.keyPrefix) {
    return [];
  }

  const keys = [];

  for (let index = 0; index < quantity; index += 1) {
    keys.push(await generateUniqueLicenseKey(product.keyPrefix, session));
  }

  return keys;
}

export async function assignLicenseKeysToOrder(order, session = null) {
  if (!order?.items?.length || order.paymentStatus !== "paid") {
    return order;
  }

  let changed = false;

  for (const item of order.items) {
    if (item.licenseKeys?.length) {
      continue;
    }

    const keys = await generateLicenseKeysForProduct(
      item.product,
      item.quantity,
      session,
    );

    if (keys.length > 0) {
      item.licenseKeys = keys;
      changed = true;
    }
  }

  if (changed) {
    await order.save({ session });
  }

  return order;
}
