import CategoryModel from "../models/category.model.js";
import ProductModel from "../models/product.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatCategory, formatProduct } from "../utils/formatters.js";
import { ApiError, throwIfInvalid } from "../utils/apiError.js";
import { validateCategoryPayload } from "../validators/schema.validator.js";
import {
  buildCategoryTreeFromDb,
  getCategoryIdsWithDescendants,
  getProductCountMap,
  buildCategoryTree,
  rollupProductCounts,
} from "../utils/categoryHelpers.js";

export const getCategories = asyncHandler(async (request, response) => {
  const flat = request.query.flat === "true";

  if (flat) {
    const categories = await CategoryModel.find({ isActive: true }).sort({
      sortOrder: 1,
      categoryId: 1,
    });
    const countMap = await getProductCountMap();

    return response.json(
      categories.map((category) => ({
        ...formatCategory(category),
        productCount: countMap[category.categoryId] || 0,
      })),
    );
  }

  const tree = await buildCategoryTreeFromDb();

  response.json(tree);
});

export const getCategoryById = asyncHandler(async (request, response) => {
  const param = request.params.id;
  const category = Number.isNaN(Number(param))
    ? await CategoryModel.findOne({ slug: String(param).toLowerCase() })
    : await CategoryModel.findOne({ categoryId: Number(param) });

  if (!category || !category.isActive) {
    throw new ApiError(404, "Category not found");
  }

  const categoryIds = await getCategoryIdsWithDescendants(category.categoryId);

  const [children, products, countMap] = await Promise.all([
    CategoryModel.find({
      parentId: category.categoryId,
      isActive: true,
    }).sort({ sortOrder: 1, categoryId: 1 }),
    ProductModel.find({
      isActive: true,
      categoryId: { $in: categoryIds },
    }).sort({ productId: 1 }),
    getProductCountMap(),
  ]);

  const flatChildren = children.map((child) => ({
    ...formatCategory(child),
    productCount: countMap[child.categoryId] || 0,
  }));

  response.json({
    ...formatCategory(category),
    productCount: categoryIds.reduce(
      (sum, id) => sum + (countMap[id] || 0),
      0,
    ),
    children: rollupProductCounts(
      buildCategoryTree(flatChildren),
      countMap,
    ),
    products: products.map(formatProduct),
  });
});

export const createCategory = asyncHandler(async (request, response) => {
  throwIfInvalid(validateCategoryPayload(request.body));

  const { name, image } = request.body;

  if (!name?.trim()) {
    throw new ApiError(400, "Category name is required");
  }

  const last = await CategoryModel.findOne().sort({ categoryId: -1 });
  const categoryId = (last?.categoryId || 0) + 1;

  const category = await CategoryModel.create({
    categoryId,
    name: name.trim(),
    slug: request.body.slug?.trim().toLowerCase() || `category-${categoryId}`,
    image: image || "",
    description: request.body.description || "",
    icon: request.body.icon || "default",
    parentId: request.body.parentId ?? null,
    sortOrder: request.body.sortOrder ?? categoryId,
  });

  response.status(201).json(formatCategory(category));
});

export const updateCategory = asyncHandler(async (request, response) => {
  throwIfInvalid(validateCategoryPayload(request.body, { partial: true }));

  const categoryId = Number(request.params.id);

  const category = await CategoryModel.findOneAndUpdate(
    { categoryId },
    request.body,
    { new: true },
  );

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  response.json(formatCategory(category));
});

export const deleteCategory = asyncHandler(async (request, response) => {
  const categoryId = Number(request.params.id);

  const category = await CategoryModel.findOneAndDelete({ categoryId });

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  response.json({ message: "Category deleted" });
});
