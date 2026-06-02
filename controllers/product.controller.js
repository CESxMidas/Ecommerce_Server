import ProductModel from "../models/product.model.js";
import CategoryModel from "../models/category.model.js";
import ReviewModel from "../models/review.model.js";
import OrderModel from "../models/order.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatProduct, formatReview } from "../utils/formatters.js";
import { ApiError, throwIfInvalid } from "../utils/apiError.js";
import { getCategoryIdsWithDescendants } from "../utils/categoryHelpers.js";
import { syncProductReviewStats } from "../utils/reviewHelpers.js";
import { validateProductPayload } from "../validators/schema.validator.js";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildEffectivePriceExpression() {
  return {
    $cond: [
      {
        $and: [
          { $ne: ["$discountPrice", null] },
          { $lt: ["$discountPrice", "$price"] },
        ],
      },
      "$discountPrice",
      "$price",
    ],
  };
}

function getProductSort(sortKey = "") {
  const sorts = {
    price_asc: { effectivePrice: 1, productId: 1 },
    "price-asc": { effectivePrice: 1, productId: 1 },
    price_desc: { effectivePrice: -1, productId: 1 },
    "price-desc": { effectivePrice: -1, productId: 1 },
    latest: { createdAt: -1, productId: -1 },
    rating: { rating: -1, reviewsCount: -1, productId: 1 },
    popular: { rating: -1, reviewsCount: -1, productId: 1 },
  };

  return sorts[String(sortKey || "").trim()] || { productId: 1 };
}

function parsePositiveInt(value, fallback, max = 100) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

export const getProducts = asyncHandler(async (request, response) => {
  const filter = { isActive: true };
  const { category, categoryId } = request.query;

  if (categoryId) {
    const ids = await getCategoryIdsWithDescendants(Number(categoryId));

    if (!Number.isNaN(ids[0])) {
      filter.categoryId = { $in: ids };
    }
  } else if (category) {
    const matched = await CategoryModel.findOne({
      slug: String(category).toLowerCase(),
      isActive: true,
    });

    if (matched) {
      const ids = await getCategoryIdsWithDescendants(matched.categoryId);
      filter.categoryId = { $in: ids };
    } else {
      filter.categoryId = -1;
    }
  }

  const {
    slug,
    q,
    minPrice,
    maxPrice,
    vendor,
    brand,
    productType,
    deliveryType,
  } = request.query;

  if (slug) {
    const bySlug = await CategoryModel.findOne({
      slug: String(slug).toLowerCase(),
      isActive: true,
    });

    if (bySlug) {
      const ids = await getCategoryIdsWithDescendants(bySlug.categoryId);
      filter.categoryId = { $in: ids };
    } else {
      filter.categoryId = -1;
    }
  }

  if (q) {
    const query = escapeRegex(String(q).trim());

    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: "i" } },
        { vendor: { $regex: query, $options: "i" } },
        { categoryName: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
        { sku: { $regex: query, $options: "i" } },
        { tags: { $regex: query, $options: "i" } },
      ];
    }
  }

  if (minPrice != null || maxPrice != null) {
    const min = Number(minPrice);
    const max = Number(maxPrice);
    const priceExpression = buildEffectivePriceExpression();
    const priceConditions = [];

    if (!Number.isNaN(min)) {
      priceConditions.push({ $gte: [priceExpression, min] });
    }

    if (!Number.isNaN(max)) {
      priceConditions.push({ $lte: [priceExpression, max] });
    }

    if (priceConditions.length > 0) {
      filter.$expr =
        priceConditions.length === 1
          ? priceConditions[0]
          : { $and: priceConditions };
    }
  }

  if (vendor || brand) {
    filter.vendor = {
      $regex: escapeRegex(String(vendor || brand).trim()),
      $options: "i",
    };
  }

  if (productType) {
    filter.productType = String(productType).trim();
  }

  if (deliveryType) {
    filter.deliveryType = String(deliveryType).trim();
  }

  const hasPage = request.query.page != null;
  const page = parsePositiveInt(request.query.page, 1);
  const limit = parsePositiveInt(request.query.limit, 12);
  const sort = getProductSort(request.query.sort);
  const pipeline = [
    { $match: filter },
    { $addFields: { effectivePrice: buildEffectivePriceExpression() } },
    { $sort: sort },
  ];

  if (hasPage) {
    const countRows = await ProductModel.aggregate([
      { $match: filter },
      { $count: "total" },
    ]);
    const total = countRows[0]?.total || 0;
    const start = (page - 1) * limit;
    const paged = await ProductModel.aggregate([
      ...pipeline,
      { $skip: start },
      { $limit: limit },
    ]);

    return response.json({
      items: paged.map(formatProduct),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }

  const products = await ProductModel.aggregate(pipeline);

  response.json(products.map(formatProduct));
});

export const getProductById = asyncHandler(async (request, response) => {
  const param = request.params.id;
  const product = Number.isNaN(Number(param))
    ? await ProductModel.findOne({
        slug: String(param).toLowerCase(),
        isActive: true,
      })
    : await ProductModel.findOne({
        productId: Number(param),
        isActive: true,
      });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  response.json(formatProduct(product));
});

export const createProduct = asyncHandler(async (request, response) => {
  throwIfInvalid(validateProductPayload(request.body));

  const lastProduct = await ProductModel.findOne().sort({ productId: -1 });
  const nextId = (lastProduct?.productId || 0) + 1;

  const product = await ProductModel.create({
    productId: nextId,
    ...request.body,
  });

  response.status(201).json(formatProduct(product));
});

export const updateProduct = asyncHandler(async (request, response) => {
  throwIfInvalid(validateProductPayload(request.body, { partial: true }));

  const productId = Number(request.params.id);

  const product = await ProductModel.findOneAndUpdate(
    { productId },
    request.body,
    { new: true, runValidators: true },
  );

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  response.json(formatProduct(product));
});

export const deleteProduct = asyncHandler(async (request, response) => {
  const productId = Number(request.params.id);

  const product = await ProductModel.findOneAndUpdate(
    { productId },
    { isActive: false },
    { new: true },
  );

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  response.json({ message: "Product removed" });
});

export const getProductReviews = asyncHandler(async (request, response) => {
  const productId = Number(request.params.id);

  const reviews = await ReviewModel.find({ productId }).sort({
    createdAt: -1,
  });

  response.json(reviews.map(formatReview));
});

export const createProductReview = asyncHandler(async (request, response) => {
  const productId = Number(request.params.id);
  const { rating, comment } = request.body;
  const normalizedRating = Number(rating);
  const normalizedComment = String(comment || "").trim();

  if (
    !Number.isInteger(normalizedRating) ||
    normalizedRating < 1 ||
    normalizedRating > 5
  ) {
    throw new ApiError(400, "Rating must be between 1 and 5");
  }

  if (!normalizedComment) {
    throw new ApiError(400, "Review comment is required");
  }

  if (normalizedComment.length > 500) {
    throw new ApiError(400, "Review must be 500 characters or less");
  }

  const product = await ProductModel.findOne({ productId, isActive: true });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  const hasPurchased = await OrderModel.exists({
    email: request.user.email,
    paymentStatus: "paid",
    "items.productId": productId,
  });

  if (!hasPurchased) {
    throw new ApiError(
      403,
      "Only verified buyers can review this product",
    );
  }

  const review = await ReviewModel.findOneAndUpdate(
    { productId, user: request.user._id },
    {
      productId,
      user: request.user._id,
      userName: request.user.name || request.user.email,
      rating: normalizedRating,
      comment: normalizedComment,
      verifiedPurchase: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await syncProductReviewStats(productId);

  response.status(201).json(formatReview(review));
});
