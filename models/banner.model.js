import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "" },
    image: { type: String, required: true },
    link: { type: String, default: "" },
    placement: {
      type: String,
      enum: ["home_slider", "ads"],
      default: "home_slider",
    },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const BannerModel = mongoose.model("Banner", bannerSchema);

export default BannerModel;
