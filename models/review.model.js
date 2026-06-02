import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    productId: { type: Number, required: true, index: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, maxlength: 500 },
    verifiedPurchase: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

reviewSchema.index({ productId: 1, user: 1 }, { unique: true });

const ReviewModel = mongoose.model("Review", reviewSchema);

export default ReviewModel;
