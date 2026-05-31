import WishlistModel from "../models/wishlist.model.js";
import ProductModel from "../models/product.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatProduct } from "../utils/formatters.js";
import { ApiError } from "../utils/apiError.js";

async function getOrCreateWishlist(userId) {
  let wishlist = await WishlistModel.findOne({ user: userId });

  if (!wishlist) {
    wishlist = await WishlistModel.create({ user: userId, items: [] });
  }

  return wishlist;
}

async function enrichWishlistItems(items = []) {
  if (!items.length) {
    return [];
  }

  const productIds = items.map((item) => item.productId);
  const products = await ProductModel.find({
    productId: { $in: productIds },
    isActive: true,
  });

  const productMap = new Map(
    products.map((product) => [product.productId, product]),
  );

  return items
    .map((item) => productMap.get(item.productId))
    .filter(Boolean)
    .map((product) => formatProduct(product));
}

export const getWishlist = asyncHandler(async (request, response) => {
  const wishlist = await getOrCreateWishlist(request.user._id);
  const products = await enrichWishlistItems(wishlist.items);

  response.json(products);
});

export const replaceWishlist = asyncHandler(async (request, response) => {
  const { productIds } = request.body;

  if (!Array.isArray(productIds)) {
    throw new ApiError(400, "productIds must be an array");
  }

  const normalizedIds = [
    ...new Set(
      productIds
        .map((id) => Number(id))
        .filter((id) => !Number.isNaN(id)),
    ),
  ];

  const wishlist = await getOrCreateWishlist(request.user._id);

  wishlist.items = normalizedIds.map((productId) => ({ productId }));
  await wishlist.save();

  const products = await enrichWishlistItems(wishlist.items);

  response.json(products);
});

export const addToWishlist = asyncHandler(async (request, response) => {
  const productId = Number(request.body.productId ?? request.params.id);

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

  const wishlist = await getOrCreateWishlist(request.user._id);
  const exists = wishlist.items.some((item) => item.productId === productId);

  if (!exists) {
    wishlist.items.push({ productId });
    await wishlist.save();
  }

  const products = await enrichWishlistItems(wishlist.items);

  response.status(201).json(products);
});

export const removeFromWishlist = asyncHandler(async (request, response) => {
  const productId = Number(request.params.id);

  if (Number.isNaN(productId)) {
    throw new ApiError(400, "Invalid product id");
  }

  const wishlist = await getOrCreateWishlist(request.user._id);

  wishlist.items = wishlist.items.filter(
    (item) => item.productId !== productId,
  );
  await wishlist.save();

  const products = await enrichWishlistItems(wishlist.items);

  response.json(products);
});
