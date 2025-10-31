import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cron from "node-cron";
import MgnregaRecord from "./models/MgnregaRecords.js";

dotenv.config();

const STATE_TO_PROCESS = "MAHARASHTRA";

async function connectToDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(">>>>>>>>>>> (Worker) MongoDB connected");
  } catch (err) {
    console.error("********** (Worker) MongoDB connection error:", err.message);
    process.exit(1);
  }
}

async function getDistrictsForState(stateName) {
  console.log(`Fetching district list for ${stateName}...`);
  try {
    const apiParams = {
      "api-key": process.env.API_KEY,
      format: "json",
      "filters[state_name]": stateName.toUpperCase(),
      limit: 1000,
    };

    const response = await axios.get(
      `https://api.data.gov.in/resource/${process.env.RESOURCE_ID}`,
      { params: apiParams }
    );

    const records = response.data.records;

    const districtSet = new Set(records.map((r) => r.district_name));
    console.log(`Found ${districtSet.size} districts.`);
    return Array.from(districtSet);
  } catch (error) {
    console.error("********* Error fetching district list:", error.message);
    return [];
  }
}

async function fetchAndSaveDistrictData(stateName, districtName) {
  console.log(`Processing data for: ${districtName}, ${stateName}`);
  try {
    const apiParams = {
      "api-key": process.env.API_KEY,
      format: "json",
      "filters[state_name]": stateName.toUpperCase(),
      "filters[district_name]": districtName.toUpperCase(),
      limit: 500,
    };

    const response = await axios.get(
      `https://api.data.gov.in/resource/${process.env.RESOURCE_ID}`,
      { params: apiParams }
    );

    const records = response.data.records;
    if (!records || records.length === 0) {
      console.warn(`No records found for ${districtName}.`);
      return;
    }

    let updatedCount = 0;
    let createdCount = 0;

    await Promise.all(
      records.map(async (record) => {
        const query = {
          state_name: record.state_name,
          district_name: record.district_name,
          fin_year: record.fin_year,
          month: record.month,
        };

        const update = {
          total_households_worked: Number(record.Total_Households_Worked) || 0,
          total_individuals_worked:
            Number(record.Total_Individuals_Worked) || 0,
          avg_days_employment:
            Number(record.Average_days_of_employment_provided_per_Household) ||
            0,
          total_hhs_completed_100_days:
            Number(
              record.Total_No_of_HHs_completed_100_Days_of_Wage_Employment
            ) || 0,
          avg_wage_rate:
            Number(record.Average_Wage_rate_per_day_per_person) || 0,
          pc_payments_on_time:
            Number(record.percentage_payments_gererated_within_15_days) || 0,
          total_expenditure: Number(record.Total_Exp) || 0,
          wages_paid: Number(record.Wages) || 0,
          sc_persondays: Number(record.SC_persondays) || 0,
          st_persondays: Number(record.ST_persondays) || 0,
          women_persondays: Number(record.Women_Persondays) || 0,
        };

        const result = await MgnregaRecord.findOneAndUpdate(query, update, {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        });

        if (result.createdAt.getTime() === result.updatedAt.getTime()) {
          createdCount++;
        } else {
          updatedCount++;
        }
      })
    );

    console.log(
      `✅ Finished ${districtName}: ${createdCount} new, ${updatedCount} updated.`
    );
  } catch (error) {
    console.error(`❌ Error processing ${districtName}:`, error.message);
  }
}

async function runDataIngestion() {
  console.log(
    `\n--->>>> Starting MGNREGA Data Ingestion Job at ${new Date().toISOString()} ---`
  );

  const districts = await getDistrictsForState(STATE_TO_PROCESS);

  if (districts.length === 0) {
    console.error("No districts found. Stopping job.");
    return;
  }

  for (const districtName of districts) {
    await fetchAndSaveDistrictData(STATE_TO_PROCESS, districtName);
  }

  console.log("--->>>> Data Ingestion Job Finished <<<<---");
}

(async () => {
  await connectToDB();

  console.log("Running initial data ingestion on startup...");
  await runDataIngestion();

  cron.schedule(
    "0 2 * * *",
    () => {
      console.log("Running scheduled daily ingestion...");
      runDataIngestion();
    },
    {
      timezone: "Asia/Kolkata",
    }
  );

  console.log(">>>> Cron job scheduled: 2:00 AM every day (Asia/Kolkata).");
})();
