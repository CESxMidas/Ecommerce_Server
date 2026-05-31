import multer from "multer";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  isCloudinaryConfigured,
  uploadBufferToCloudinary,
} from "../utils/cloudinaryUpload.js";
import { ApiError } from "../utils/apiError.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadMiddleware = upload.single("file");

export const uploadImage = asyncHandler(async (request, response) => {
  if (!request.file) {
    throw new ApiError(400, "Image file is required");
  }

  if (!isCloudinaryConfigured()) {
    throw new ApiError(
      503,
      "Cloudinary chưa cấu hình. Thêm CLOUDINARY_* vào .env",
    );
  }

  const folder = request.body.folder || "ecommerce";
  const result = await uploadBufferToCloudinary(request.file.buffer, folder);

  response.status(201).json(result);
});
