import {
  computeDiscountPercent,
  getSalePriceFromDoc,
  resolvePricing,
  sanitizeImageUrls,
} from "./dataNormalization.js";
import { getPurchaseVariants } from "./productVariants.js";

export function computeDiscount(oldPrice, price) {
  return computeDiscountPercent(oldPrice, price);
}

function normalizeProductType(value) {
  const allowed = new Set([
    "license_key",
    "redeem_code",
    "account",
    "manual_service",
    "hardware",
  ]);

  return allowed.has(value) ? value : "manual_service";
}

function normalizeDeliveryType(value, productType) {
  const allowed = new Set([
    "instant_key",
    "account_credentials",
    "manual_delivery",
    "physical",
  ]);

  if (allowed.has(value)) {
    return value;
  }

  if (productType === "hardware") {
    return "physical";
  }

  if (productType === "license_key" || productType === "redeem_code") {
    return "instant_key";
  }

  if (productType === "account") {
    return "account_credentials";
  }

  return "manual_delivery";
}

export function formatProduct(product) {
  if (!product) {
    return null;
  }

  const doc = product.toObject ? product.toObject() : product;
  const name = doc.name || doc.title || "";
  const { price, discountPrice } = resolvePricing(doc);
  const salePrice = getSalePriceFromDoc(doc);
  const listPrice = discountPrice != null ? price : null;
  const thumbnail =
    doc.thumbnail || doc.image || doc.images?.[0] || "";
  const images = sanitizeImageUrls(
    doc.images?.length ? doc.images : [thumbnail],
  );
  const categoryId =
    doc.categoryId != null ? String(doc.categoryId) : "";
  const vendor = doc.vendor || doc.brand || "";
  const badge = doc.badge || doc.tag || "";
  const createdAt = doc.createdAt
    ? new Date(doc.createdAt).toISOString()
    : new Date().toISOString();
  const productType = normalizeProductType(doc.productType);
  const deliveryType = normalizeDeliveryType(doc.deliveryType, productType);
  const requiresOnlinePayment =
    doc.requiresOnlinePayment !== undefined
      ? Boolean(doc.requiresOnlinePayment)
      : deliveryType !== "physical";

  const purchaseVariants = getPurchaseVariants({
    ...doc,
    price,
    discountPrice,
    productType,
  });

  const canonical = {
    id: doc.productId ?? doc.id,
    sku: doc.sku || "",
    name,
    slug: doc.slug || "",
    description: doc.description || "",
    price,
    discountPrice: discountPrice ?? undefined,
    currency: doc.currency || "USD",
    images,
    thumbnail: thumbnail || images[0] || "",
    categoryId,
    categoryName: doc.categoryName || "",
    vendor,
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    attributes: doc.attributes || {},
    variants: purchaseVariants.length > 0
      ? purchaseVariants
      : Array.isArray(doc.variants)
        ? doc.variants
        : [],
    stock: Number(doc.stock ?? 0),
    rating: Number(doc.rating ?? 0),
    reviewsCount: Number(doc.reviewsCount ?? 0),
    isActive: doc.isActive !== false,
    createdAt,
    badge,
    salePrice,
    listPrice,
    productType,
    deliveryType,
    requiresOnlinePayment,
    keyPrefix: doc.keyPrefix || "",
    weight: Number(doc.weight ?? 0),
    dimensions: doc.dimensions || { length: 0, width: 0, height: 0 },
    seoTitle: doc.seoTitle || name,
    seoDescription: doc.seoDescription || doc.description || "",
  };

  return {
    ...canonical,
    brand: vendor,
    title: name,
    image: canonical.thumbnail,
    oldPrice: listPrice ?? 0,
    tag: badge,
    discount: computeDiscountPercent(price, salePrice),
  };
}

export function formatCategory(category) {
  if (!category) {
    return null;
  }

  const doc = category.toObject ? category.toObject() : category;
  const id = String(doc.categoryId ?? doc.id ?? "");

  return {
    id,
    name: doc.name,
    slug: doc.slug,
    image: doc.image || "",
    description: doc.description || "",
    icon: doc.icon || "default",
    parentId:
      doc.parentId != null && doc.parentId !== ""
        ? String(doc.parentId)
        : null,
    sortOrder: doc.sortOrder ?? 0,
    isActive: doc.isActive !== false,
  };
}

export function formatAuthUser(user, token) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.mobile || "",
    avatar: user.avatar || "",
    phoneVerified: Boolean(user.phoneVerified),
    dateOfBirth: user.dateOfBirth,
    gender: user.gender || "",
    verify_email: Boolean(user.verify_email),
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    role: user.role,
    token,
  };
}

export function formatProfile(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.mobile || "",
    avatar: user.avatar || "",
    phoneVerified: Boolean(user.phoneVerified),
    dateOfBirth: user.dateOfBirth,
    gender: user.gender || "",
    verify_email: Boolean(user.verify_email),
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    pendingEmail: user.email_change_new || "",
  };
}

export function formatOrder(order) {
  const doc = order.toObject ? order.toObject() : order;
  const canRevealLicenseKeys = doc.paymentStatus === "paid";

  return {
    id: doc.orderId,
    paymentId: doc.paymentId,
    name: doc.name,
    phone: doc.phone,
    address: doc.address,
    pincode: doc.pincode,
    total: doc.total,
    subtotal: doc.subtotal ?? doc.total,
    discount: doc.discount ?? 0,
    tax: doc.tax ?? 0,
    shippingFee: doc.shippingFee ?? 0,
    currency: doc.currency || "USD",
    email: doc.email,
    userId: doc.userId,
    status: doc.status,
    items: (doc.items || []).map((item) => ({
      productId: item.productId,
      sku: item.sku || item.product?.sku || "",
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? item.product?.salePrice ?? item.product?.price ?? 0,
      lineTotal: item.lineTotal ?? 0,
      currency: item.currency || doc.currency || "USD",
      variant: item.variant || null,
      licenseKeys: canRevealLicenseKeys ? item.licenseKeys || [] : [],
      product: item.product ? formatProduct(item.product) : item.product,
    })),
    paymentMethod: doc.paymentMethod,
    paymentStatus: doc.paymentStatus,
    paymentUrl: doc.paymentUrl || "",
    couponCode: doc.couponCode || "",
    stockDeducted: Boolean(doc.stockDeducted),
    createdAt: doc.createdAt,
  };
}

export function formatAddress(address) {
  const doc = address.toObject ? address.toObject() : address;

  return {
    id: doc._id,
    label: doc.label || "",
    fullName: doc.fullName || "",
    address_line: doc.address_line,
    city: doc.city,
    state: doc.state,
    pincode: doc.pincode,
    country: doc.country,
    mobile: doc.mobile,
    province: doc.province || "",
    district: doc.district || "",
    ward: doc.ward || "",
    isDefault: Boolean(doc.isDefault),
    status: doc.status,
  };
}

export function formatReview(review) {
  const doc = review.toObject ? review.toObject() : review;

  return {
    id: doc._id,
    productId: doc.productId,
    userName: doc.userName,
    rating: doc.rating,
    comment: doc.comment,
    createdAt: doc.createdAt,
  };
}

export function formatCartItem(item) {
  return {
    productId: item.productId,
    quantity: item.quantity,
    product: formatProduct(item.product),
  };
}
