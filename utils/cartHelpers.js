import ProductModel from "../models/product.model.js";
import CartModel from "../models/cart.model.js";
import { ApiError } from "./apiError.js";
import { formatProduct } from "./formatters.js";
import { resolvePurchaseVariant } from "./productVariants.js";

export function assertSufficientStock(product, quantity) {
  const requested = Number(quantity);

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  if (requested < 1 || !Number.isInteger(requested)) {
    throw new ApiError(400, "Quantity must be at least 1");
  }

  if (product.stock < requested) {
    throw new ApiError(
      400,
      `Insufficient stock for "${product.name}" (available: ${product.stock})`,
    );
  }
}

export async function getOrCreateCart(userId, session = null) {
  let cart = await CartModel.findOne({ user: userId }).session(session);

  if (!cart) {
    const [createdCart] = await CartModel.create(
      [{ user: userId, items: [] }],
      { session },
    );
    cart = createdCart;
  }

  return cart;
}

export async function enrichCartItems(items) {
  if (!items?.length) {
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
    .map((item) => {
      const product = productMap.get(item.productId);

      if (!product) {
        return null;
      }

      return {
        productId: item.productId,
        quantity: item.quantity,
        variant: resolvePurchaseVariant(product, item.variant),
        product: formatProduct(product),
      };
    })
    .filter(Boolean);
}
