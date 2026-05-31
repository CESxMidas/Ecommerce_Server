import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      default: "account",
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    data: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true },
);

const NotificationModel = mongoose.model("Notification", notificationSchema);

export default NotificationModel;
