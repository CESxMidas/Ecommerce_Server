import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    variant: { type: Object, default: null },
  },
  { _id: false },
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: [cartItemSchema],
  },
  { timestamps: true },
);

const CartModel = mongoose.model("Cart", cartSchema);

export default CartModel;
