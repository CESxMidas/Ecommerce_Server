import mongoose from "mongoose";

const ticketReplySchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorRole: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

const ticketSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: {
      type: String,
      default: "",
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["open", "pending", "resolved", "closed"],
      default: "open",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high"],
      default: "normal",
    },
    replies: {
      type: [ticketReplySchema],
      default: [],
    },
  },
  { timestamps: true },
);

const TicketModel = mongoose.model("Ticket", ticketSchema);

export default TicketModel;
