// models/MgnregaRecord.js
import mongoose from "mongoose";

const mgnregaRecordSchema = new mongoose.Schema(
  {
    state_name: { type: String, required: true, index: true },
    district_name: { type: String, required: true, index: true },
    fin_year: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },

    total_households_worked: { type: Number, default: 0 },
    avg_days_employment: { type: Number, default: 0 },
    total_hhs_completed_100_days: { type: Number, default: 0 },
    avg_wage_rate: { type: Number, default: 0 },
    wages_paid: { type: Number, default: 0 },
    pc_payments_on_time: { type: Number, default: 0 },
    number_of_completed_works: { type: Number, default: 0 },

    total_individuals_worked: { type: Number, default: 0 },
    sc_persondays: { type: Number, default: 0 },
    st_persondays: { type: Number, default: 0 },
    women_persondays: { type: Number, default: 0 },
    differently_abled_persondays: { type: Number, default: 0 },
    pc_expenditure_on_agri: { type: Number, default: 0 },
    pc_nrm_expenditure: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

mgnregaRecordSchema.index(
  { state_name: 1, district_name: 1, fin_year: 1, month: 1 },
  { unique: true }
);

export default mongoose.model("MgnregaRecord", mgnregaRecordSchema);
