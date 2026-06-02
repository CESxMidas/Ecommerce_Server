import CounterModel from "../models/counter.model.js";

export async function getNextSequence(name, initialValue = 0) {
  try {
    await CounterModel.updateOne(
      { _id: name },
      { $max: { seq: initialValue } },
      { upsert: true, setDefaultsOnInsert: true },
    );

    const counter = await CounterModel.findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      {
        new: true,
      },
    );

    return counter.seq;
  } catch (error) {
    if (error?.code === 11000) {
      const counter = await CounterModel.findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { new: true },
      );

      return counter.seq;
    }

    throw error;
  }
}
