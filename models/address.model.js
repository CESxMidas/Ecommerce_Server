import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      default: "",
    },

    fullName: {
      type: String,
      default: "",
    },

    address_line: {
      type: String,
      default: "",
    },

    city: {
      type: String,
      default: "",
    },

    state: {
      type: String,
      default: "",
    },

    pincode: {
      type: String,
      default: "",
    },

    country: {
      type: String,
      default: "",
    },

    mobile: {
      type: String,
      default: "",
    },

    province: {
      type: String,
      default: "",
    },

    district: {
      type: String,
      default: "",
    },

    ward: {
      type: String,
      default: "",
    },

    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },

    status: {
      type: Boolean,
      default: true,
    },

    userId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

const AddressModel = mongoose.model("address", addressSchema);

export default AddressModel;
