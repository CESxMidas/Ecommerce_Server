import mongoose from "mongoose";

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

const CounterModel = mongoose.model("Counter", counterSchema);

export default CounterModel;
