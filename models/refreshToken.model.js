import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    deviceName: { type: String, default: "" },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshTokenModel = mongoose.model("RefreshToken", refreshTokenSchema);

export default RefreshTokenModel;
