import mongoose from "mongoose";

const wishlistItemSchema = new mongoose.Schema(
  {
    productId: { type: Number, required: true },
  },
  { _id: false },
);

const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: [wishlistItemSchema],
  },
  { timestamps: true },
);

const WishlistModel = mongoose.model("Wishlist", wishlistSchema);

export default WishlistModel;
