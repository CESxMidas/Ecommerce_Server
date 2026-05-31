import { v2 as cloudinary } from "cloudinary";

let configured = false;

function ensureCloudinary() {
  if (configured) {
    return true;
  }

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return false;
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });

  configured = true;

  return true;
}

export function isCloudinaryConfigured() {
  return ensureCloudinary();
}

export async function uploadBufferToCloudinary(buffer, folder = "ecommerce") {
  if (!ensureCloudinary()) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
    );
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      },
    );

    stream.end(buffer);
  });
}
