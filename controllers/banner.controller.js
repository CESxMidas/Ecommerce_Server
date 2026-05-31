import BannerModel from "../models/banner.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";

export const getBanners = asyncHandler(async (request, response) => {
  const filter = { isActive: true };

  if (request.query.placement) {
    filter.placement = request.query.placement;
  }

  const banners = await BannerModel.find(filter).sort({
    sortOrder: 1,
    createdAt: -1,
  });

  response.json(banners);
});

export const adminGetBanners = asyncHandler(async (request, response) => {
  const banners = await BannerModel.find().sort({ sortOrder: 1 });
  response.json(banners);
});

export const createBanner = asyncHandler(async (request, response) => {
  const { title, image } = request.body;

  if (!title?.trim() || !image?.trim()) {
    throw new ApiError(400, "Title and image are required");
  }

  const banner = await BannerModel.create(request.body);
  response.status(201).json(banner);
});

export const updateBanner = asyncHandler(async (request, response) => {
  const banner = await BannerModel.findByIdAndUpdate(
    request.params.id,
    request.body,
    { new: true },
  );

  if (!banner) {
    throw new ApiError(404, "Banner not found");
  }

  response.json(banner);
});

export const deleteBanner = asyncHandler(async (request, response) => {
  const banner = await BannerModel.findByIdAndDelete(request.params.id);

  if (!banner) {
    throw new ApiError(404, "Banner not found");
  }

  response.json({ message: "Banner deleted" });
});
