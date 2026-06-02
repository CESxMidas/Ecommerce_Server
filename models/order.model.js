import mongoose from "mongoose";

const orderProductSnapshotSchema = new mongoose.Schema(
  {
    id: mongoose.Schema.Types.Mixed,
    sku: String,
    name: String,
    slug: String,
    description: String,
    price: Number,
    discountPrice: Number,
    currency: String,
    images: [String],
    thumbnail: String,
    categoryId: String,
    categoryName: String,
    vendor: String,
    stock: Number,
    rating: Number,
    reviewsCount: Number,
    isActive: Boolean,
    createdAt: Date,
    title: String,
    brand: String,
    image: String,
    oldPrice: Number,
    tag: String,
    discount: String,
    productType: String,
    deliveryType: String,
    requiresOnlinePayment: Boolean,
    attributes: Object,
    keyPrefix: String,
  },
  { _id: false },
);

const orderItemSchema = new mongoose.Schema(
  {
    productId: Number,
    sku: String,
    quantity: Number,
    unitPrice: Number,
    lineTotal: Number,
    currency: { type: String, default: "USD" },
    variant: { type: Object, default: null },
    product: orderProductSnapshotSchema,
    licenseKeys: { type: [String], default: [] },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: String, required: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    pincode: { type: String, default: "000000" },
    total: { type: Number, required: true },
    email: { type: String, required: true },
    userId: { type: String, default: "guest" },
    status: {
      type: String,
      enum: [
        "PendingPayment",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
        "Failed",
        "Refunded",
      ],
      default: "PendingPayment",
    },
    paymentMethod: { type: String, default: "card" },
    paymentStatus: {
      type: String,
      enum: ["paid", "pending", "awaiting_cod", "failed", "refunded"],
      default: "pending", // ĐÃ SỬA: Nên để mặc định ban đầu tạo đơn là pending thay vì paid
    },
    paymentUrl: { type: String, default: "" },
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    couponCode: { type: String, default: "" },
    couponUsageIncremented: { type: Boolean, default: false },
    tax: { type: Number, default: 0 },
    shippingFee: { type: Number, default: 0 },
    currency: { type: String, default: "USD" },
    stockDeducted: { type: Boolean, default: false },
    stockRestored: { type: Boolean, default: false },
    hiddenByUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    items: [orderItemSchema],

    // 🌟 THÊM TRƯỜNG NÀY ĐỂ KÍCH HOẠT TỰ ĐỘNG XÓA ĐƠN HÀNG
    expiresAt: {
      type: Date,
      index: true,
    },
  },
  { timestamps: true },
);

const OrderModel = mongoose.model("Order", orderSchema);

export async function ensureOrderIndexes() {
  let indexes = [];

  try {
    indexes = await OrderModel.collection.indexes();
  } catch (error) {
    if (error?.codeName !== "NamespaceNotFound") {
      throw error;
    }
  }

  const ttlExpiresAtIndex = indexes.find(
    (index) =>
      index.name === "expiresAt_1" &&
      Object.prototype.hasOwnProperty.call(index, "expireAfterSeconds"),
  );

  if (ttlExpiresAtIndex) {
    await OrderModel.collection.dropIndex("expiresAt_1");
  }

  await OrderModel.collection.createIndex({ expiresAt: 1 }, { name: "expiresAt_1" });
}

export default OrderModel;
