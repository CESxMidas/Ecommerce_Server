import BlogModel from "../models/blog.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";

export const getBlogs = asyncHandler(async (request, response) => {
  const blogs = await BlogModel.find({ isActive: true }).sort({
    publishedAt: -1,
  });

  response.json(blogs);
});

export const getBlogById = asyncHandler(async (request, response) => {
  const blog = await BlogModel.findOne({
    _id: request.params.id,
    isActive: true,
  });

  if (!blog) {
    throw new ApiError(404, "Blog not found");
  }

  response.json(blog);
});

export const adminGetBlogs = asyncHandler(async (request, response) => {
  const blogs = await BlogModel.find().sort({ publishedAt: -1 });
  response.json(blogs);
});

export const createBlog = asyncHandler(async (request, response) => {
  const { title } = request.body;

  if (!title?.trim()) {
    throw new ApiError(400, "Title is required");
  }

  const blog = await BlogModel.create(request.body);
  response.status(201).json(blog);
});

export const updateBlog = asyncHandler(async (request, response) => {
  const blog = await BlogModel.findByIdAndUpdate(
    request.params.id,
    request.body,
    { new: true },
  );

  if (!blog) {
    throw new ApiError(404, "Blog not found");
  }

  response.json(blog);
});

export const deleteBlog = asyncHandler(async (request, response) => {
  const blog = await BlogModel.findByIdAndDelete(request.params.id);

  if (!blog) {
    throw new ApiError(404, "Blog not found");
  }

  response.json({ message: "Blog deleted" });
});
