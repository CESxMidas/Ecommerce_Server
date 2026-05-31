import ProductModel from "../models/product.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  assertSufficientStock,
  getOrCreateCart,
  enrichCartItems,
} from "../utils/cartHelpers.js";
import { ApiError } from "../utils/apiError.js";
import { resolvePurchaseVariant } from "../utils/productVariants.js";

function getVariantId(variant) {
  return variant?.id ? String(variant.id) : "";
}

export const getCart = asyncHandler(async (request, response) => {
  const cart = await getOrCreateCart(request.user._id);
  const items = await enrichCartItems(cart.items);

  response.json(items);
});

export const addToCart = asyncHandler(async (request, response) => {
  const productId = Number(request.body.productId ?? request.body.id);
  const quantity = Number(request.body.quantity) || 1;

  if (Number.isNaN(productId)) {
    throw new ApiError(400, "productId is required");
  }

  const product = await ProductModel.findOne({
    productId,
    isActive: true,
  });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  const variant = resolvePurchaseVariant(product, request.body.variant);
  const cart = await getOrCreateCart(request.user._id);
  const existingIndex = cart.items.findIndex(
    (item) =>
      item.productId === productId &&
      getVariantId(item.variant) === getVariantId(variant),
  );

  const nextQuantity =
    existingIndex >= 0
      ? cart.items[existingIndex].quantity + quantity
      : quantity;

  assertSufficientStock(product, nextQuantity);

  if (existingIndex >= 0) {
    cart.items[existingIndex].quantity = nextQuantity;
    cart.items[existingIndex].variant = variant;
  } else {
    cart.items.push({ productId, quantity: nextQuantity, variant });
  }

  await cart.save();

  const items = await enrichCartItems(cart.items);

  response.status(201).json(items);
});

export const updateCartItem = asyncHandler(async (request, response) => {
  const productId = Number(request.params.id);
  const quantity = Number(request.body.quantity);

  if (Number.isNaN(productId)) {
    throw new ApiError(400, "Invalid cart item id");
  }

  if (Number.isNaN(quantity) || quantity < 1) {
    throw new ApiError(400, "Quantity must be at least 1");
  }

  const product = await ProductModel.findOne({
    productId,
    isActive: true,
  });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  assertSufficientStock(product, quantity);

  const variant = resolvePurchaseVariant(product, request.body.variant);
  const variantId = String(
    request.body.variantId || request.query.variantId || getVariantId(variant),
  );
  const cart = await getOrCreateCart(request.user._id);
  const item = cart.items.find(
    (entry) =>
      entry.productId === productId &&
      getVariantId(entry.variant) === variantId,
  );

  if (!item) {
    throw new ApiError(404, "Cart item not found");
  }

  item.quantity = quantity;
  item.variant = variant;
  await cart.save();

  const items = await enrichCartItems(cart.items);

  response.json(items);
});

export const removeCartItem = asyncHandler(async (request, response) => {
  const productId = Number(request.params.id);
  const variantId = String(request.query.variantId || "");

  const cart = await getOrCreateCart(request.user._id);

  cart.items = cart.items.filter((item) => {
    if (item.productId !== productId) {
      return true;
    }

    return variantId && getVariantId(item.variant) !== variantId;
  });
  await cart.save();

  const items = await enrichCartItems(cart.items);

  response.json(items);
});

export const replaceCart = asyncHandler(async (request, response) => {
  const { items } = request.body;

  if (!Array.isArray(items)) {
    throw new ApiError(400, "items must be an array");
  }

  const normalizedItems = items
    .map((item) => ({
      productId: Number(item.productId),
      quantity: Number(item.quantity) || 1,
      variant: item.variant || null,
    }))
    .filter((item) => !Number.isNaN(item.productId));

  if (normalizedItems.length === 0) {
    const cart = await getOrCreateCart(request.user._id);
    cart.items = [];
    await cart.save();

    return response.json([]);
  }

  const productIds = normalizedItems.map((item) => item.productId);
  const products = await ProductModel.find({
    productId: { $in: productIds },
    isActive: true,
  });
  const productMap = new Map(
    products.map((product) => [product.productId, product]),
  );

  for (const item of normalizedItems) {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new ApiError(404, `Product ${item.productId} is not available`);
    }

    item.variant = resolvePurchaseVariant(product, item.variant);
    assertSufficientStock(product, item.quantity);
  }

  const cart = await getOrCreateCart(request.user._id);

  cart.items = normalizedItems;

  await cart.save();

  const enriched = await enrichCartItems(cart.items);

  response.json(enriched);
});
