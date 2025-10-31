import mongoose from "mongoose";

const districtCacheSchema = new mongoose.Schema({
  district: { type: String, required: true, unique: true },
  data: { type: Object, required: true },
  lastUpdated: { type: Date, default: Date.now },
});

export default mongoose.model("DistrictCache", districtCacheSchema);
