import { getSalePriceFromDoc, resolvePricing } from "./dataNormalization.js";

const DIGITAL_PRODUCT_TYPES = new Set([
  "license_key",
  "redeem_code",
  "account",
  "manual_service",
]);

export function isVariantProduct(product) {
  return DIGITAL_PRODUCT_TYPES.has(product?.productType);
}

function normalizeVariant(raw, fallbackPrice) {
  const id = String(raw?.id || raw?.code || raw?.name || "").trim();
  const name = String(raw?.name || raw?.label || id).trim();
  const price = Number(raw?.price ?? raw?.salePrice ?? fallbackPrice);
  const listPrice = raw?.listPrice != null ? Number(raw.listPrice) : null;

  if (!id || !name || Number.isNaN(price) || price < 0) {
    return null;
  }

  return {
    id,
    name,
    price,
    listPrice: listPrice != null && !Number.isNaN(listPrice) ? listPrice : null,
    duration: raw?.duration || id,
  };
}

export function getPurchaseVariants(product) {
  if (!isVariantProduct(product)) {
    return [];
  }

  const baseSalePrice = getSalePriceFromDoc(product);
  const { price: baseListPrice } = resolvePricing(product);
  const customVariants = Array.isArray(product?.variants)
    ? product.variants
        .map((variant) => normalizeVariant(variant, baseSalePrice))
        .filter(Boolean)
    : [];

  if (customVariants.length > 0) {
    return customVariants;
  }

  return [
    {
      id: "monthly",
      name: "Key tháng",
      price: baseSalePrice,
      listPrice: baseListPrice > baseSalePrice ? baseListPrice : null,
      duration: "monthly",
    },
    {
      id: "yearly",
      name: "Key năm",
      price: Math.round(baseSalePrice * 10),
      listPrice: null,
      duration: "yearly",
    },
    {
      id: "lifetime",
      name: "Key vĩnh viễn",
      price: Math.round(baseSalePrice * 24),
      listPrice: null,
      duration: "lifetime",
    },
  ];
}

export function resolvePurchaseVariant(product, requestedVariant) {
  const variants = getPurchaseVariants(product);

  if (variants.length === 0) {
    return null;
  }

  const requestedId =
    typeof requestedVariant === "string"
      ? requestedVariant
      : requestedVariant?.id;

  return (
    variants.find((variant) => variant.id === requestedId) ||
    variants[0]
  );
}
