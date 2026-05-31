import mongoose from "mongoose";

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    category: { type: String, default: "General", trim: true },
    publishedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const BlogModel = mongoose.model("Blog", blogSchema);

export default BlogModel;
