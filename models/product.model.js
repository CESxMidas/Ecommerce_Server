import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    productId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    description: { type: String, default: "" },
    sku: { type: String, trim: true, unique: true, sparse: true, index: true },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, min: 0, default: null },
    currency: { type: String, default: "USD", trim: true, uppercase: true },
    images: { type: [String], default: [] },
    thumbnail: { type: String, default: "" },
    categoryId: { type: Number, default: null, index: true },
    categoryName: { type: String, default: "", trim: true },
    vendor: { type: String, default: "", trim: true },
    tags: { type: [String], default: [] },
    attributes: { type: Object, default: {} },
    variants: { type: [Object], default: [] },
    stock: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0, min: 0 },
    badge: { type: String, default: "" },
    productType: {
      type: String,
      enum: [
        "license_key",
        "redeem_code",
        "account",
        "manual_service",
        "hardware",
      ],
      default: "manual_service",
    },
    deliveryType: {
      type: String,
      enum: [
        "instant_key",
        "account_credentials",
        "manual_delivery",
        "physical",
      ],
      default: "manual_delivery",
      index: true,
    },
    requiresOnlinePayment: { type: Boolean, default: true },
    keyPrefix: { type: String, default: "", trim: true },
    weight: { type: Number, default: 0, min: 0 },
    dimensions: {
      length: { type: Number, default: 0, min: 0 },
      width: { type: Number, default: 0, min: 0 },
      height: { type: Number, default: 0, min: 0 },
    },
    seoTitle: { type: String, default: "", trim: true },
    seoDescription: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

productSchema.index({ categoryId: 1, isActive: 1 });
productSchema.index({ name: "text", description: "text", vendor: "text" });

const ProductModel = mongoose.model("Product", productSchema);

export default ProductModel;
