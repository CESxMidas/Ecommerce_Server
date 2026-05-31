import ProductModel from "../models/product.model.js";
import ReviewModel from "../models/review.model.js";

export async function syncProductReviewStats(productId) {
  const reviews = await ReviewModel.find({ productId });
  const reviewsCount = reviews.length;
  const rating =
    reviewsCount > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) /
        reviewsCount
      : 0;

  await ProductModel.updateOne(
    { productId },
    {
      rating: Math.round(rating * 10) / 10,
      reviewsCount,
    },
  );

  return { rating, reviewsCount };
}
