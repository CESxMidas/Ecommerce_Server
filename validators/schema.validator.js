const EMAIL_PATTERN = /\S+@\S+\.\S+/;
const PHONE_PATTERN = /^[0-9+\-\s()]{8,20}$/;

export function validateEmail(value, label = "Email") {
  const email = String(value || "").trim();

  if (!email) return `${label} is required`;
  if (!EMAIL_PATTERN.test(email)) return `Invalid ${label.toLowerCase()} format`;

  return "";
}

export function validateString(value, label, { min = 1, max = 500 } = {}) {
  const normalized = String(value || "").trim();

  if (normalized.length < min) return `${label} is required`;
  if (normalized.length > max) return `${label} must be ${max} characters or less`;

  return "";
}

export function validateNumber(value, label, { min = 0, integer = false } = {}) {
  const number = Number(value);

  if (Number.isNaN(number)) return `${label} must be a number`;
  if (integer && !Number.isInteger(number)) return `${label} must be an integer`;
  if (number < min) return `${label} must be at least ${min}`;

  return "";
}

export function compactErrors(errors) {
  return errors.filter(Boolean);
}

export function validateOrderPayload(body) {
  const errors = [
    validateString(body.name, "Name", { max: 120 }),
    validateEmail(body.email),
    validateString(body.phone, "Phone", { max: 30 }),
    body.phone && !PHONE_PATTERN.test(String(body.phone).trim())
      ? "Invalid phone number"
      : "",
    validateString(body.address, "Address", { max: 500 }),
  ];

  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push("At least one order item is required");
  } else {
    for (const item of body.items) {
      errors.push(validateNumber(item?.productId, "Product ID", { min: 1, integer: true }));
      errors.push(validateNumber(item?.quantity, "Quantity", { min: 1, integer: true }));

      if (compactErrors(errors).length > 0) break;
    }
  }

  return compactErrors(errors);
}

export function validateProductPayload(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.name !== undefined) {
    errors.push(validateString(body.name, "Product name", { max: 180 }));
  }

  if (!partial || body.price !== undefined) {
    errors.push(validateNumber(body.price, "Price", { min: 0 }));
  }

  if (body.discountPrice != null) {
    errors.push(validateNumber(body.discountPrice, "Discount price", { min: 0 }));
  }

  if (body.stock != null) {
    errors.push(validateNumber(body.stock, "Stock", { min: 0, integer: true }));
  }

  if (body.images != null && !Array.isArray(body.images)) {
    errors.push("Images must be an array");
  }

  if (body.variants != null && !Array.isArray(body.variants)) {
    errors.push("Variants must be an array");
  }

  return compactErrors(errors);
}

export function validateCategoryPayload(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.name !== undefined) {
    errors.push(validateString(body.name, "Category name", { max: 120 }));
  }

  if (body.parentId != null && body.parentId !== "") {
    errors.push(validateNumber(body.parentId, "Parent category ID", {
      min: 1,
      integer: true,
    }));
  }

  return compactErrors(errors);
}

export function validateCouponPayload(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.code !== undefined) {
    errors.push(validateString(body.code, "Coupon code", { max: 40 }));
  }

  if (!partial || body.value !== undefined) {
    errors.push(validateNumber(body.value, "Coupon value", { min: 0 }));
  }

  if (body.type != null && !["percent", "fixed"].includes(body.type)) {
    errors.push("Invalid coupon type");
  }

  if (body.minOrder != null) {
    errors.push(validateNumber(body.minOrder, "Minimum order", { min: 0 }));
  }

  if (body.maxDiscount != null) {
    errors.push(validateNumber(body.maxDiscount, "Maximum discount", { min: 0 }));
  }

  if (body.usageLimit != null) {
    errors.push(validateNumber(body.usageLimit, "Usage limit", {
      min: 1,
      integer: true,
    }));
  }

  return compactErrors(errors);
}

export function validateProfilePayload(body) {
  const errors = [];

  if (body.name !== undefined) {
    errors.push(validateString(body.name, "Name", { max: 120 }));
  }

  if (body.phone !== undefined && body.phone && !PHONE_PATTERN.test(String(body.phone))) {
    errors.push("Invalid phone number");
  }

  if (body.gender !== undefined && !["", "male", "female", "other"].includes(body.gender)) {
    errors.push("Invalid gender");
  }

  return compactErrors(errors);
}

export function validateAddressPayload(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.address_line !== undefined) {
    errors.push(validateString(body.address_line, "Address line", { max: 300 }));
  }

  if (!partial || body.city !== undefined) {
    errors.push(validateString(body.city, "City", { max: 120 }));
  }

  return compactErrors(errors);
}
