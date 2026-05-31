export function validatePlaceOrder(body) {
  const errors = [];
  const { name, email, phone, address, total, items } = body;

  if (!name?.trim()) {
    errors.push("Name is required");
  }

  if (!email?.trim()) {
    errors.push("Email is required");
  }

  if (!phone?.trim()) {
    errors.push("Phone is required");
  }

  if (!address?.trim()) {
    errors.push("Address is required");
  }

  if (total === undefined || total === null || Number.isNaN(Number(total))) {
    errors.push("Total is required");
  }

  if (!Array.isArray(items) || items.length === 0) {
    errors.push("At least one order item is required");
  } else {
    for (const item of items) {
      const productId = Number(item?.productId);

      if (Number.isNaN(productId)) {
        errors.push("Each item must include a valid productId");
        break;
      }

      const quantity = Number(item?.quantity);

      if (!quantity || quantity < 1 || !Number.isInteger(quantity)) {
        errors.push("Each item must have a quantity of at least 1");
        break;
      }
    }
  }

  return errors;
}
