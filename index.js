import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import axios from 'axios';
import cron from 'node-cron';
import MgnregaRecord from './models/MgnregaRecords.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(cors());
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err.message));

const STATE_TO_PROCESS = 'MAHARASHTRA';

async function getDistrictsForState(stateName) {
  console.log(`Fetching district list for ${stateName}...`);
  try {
    const apiParams = {
      'api-key': process.env.API_KEY,
      format: 'json',
      'filters[state_name]': stateName.toUpperCase(),
      limit: 1000,
    };
    const response = await axios.get(
      `https://api.data.gov.in/resource/${process.env.RESOURCE_ID}`,
      { params: apiParams }
    );
    const records = response.data.records;
    const districtSet = new Set(records.map(r => r.district_name));
    console.log(`Found ${districtSet.size} districts.`);
    return Array.from(districtSet);
  } catch (error) {
    console.error('Error fetching district list:', error.message);
    return [];
  }
}

async function fetchAndSaveDistrictData(stateName, districtName) {
  console.log(`Processing data for: ${districtName}, ${stateName}`);
  try {
    const apiParams = {
      'api-key': process.env.API_KEY,
      format: 'json',
      'filters[state_name]': stateName.toUpperCase(),
      'filters[district_name]': districtName.toUpperCase(),
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

    await Promise.all(records.map(async (record) => {
      const query = {
        state_name: record.state_name,
        district_name: record.district_name,
        fin_year: record.fin_year,
        month: record.month,
      };
      const update = {
        total_households_worked: Number(record.Total_Households_Worked) || 0,
        total_individuals_worked: Number(record.Total_Individuals_Worked) || 0,
        avg_days_employment: Number(record.Average_days_of_employment_provided_per_Household) || 0,
        total_hhs_completed_100_days: Number(record.Total_No_of_HHs_completed_100_Days_of_Wage_Employment) || 0,
        avg_wage_rate: Number(record.Average_Wage_rate_per_day_per_person) || 0,
        pc_payments_on_time: Number(record.percentage_payments_gererated_within_15_days) || 0,
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
    }));
    console.log(`Finished ${districtName}: ${createdCount} new, ${updatedCount} updated.`);
  } catch (error) {
    console.error(`Error processing ${districtName}:`, error.message);
  }
}

async function runDataIngestion() {
  console.log(`Starting MGNREGA Data Ingestion Job at ${new Date().toISOString()}`);
  const districts = await getDistrictsForState(STATE_TO_PROCESS);
  if (districts.length === 0) {
    console.error("No districts found. Stopping job.");
    return;
  }
  for (const districtName of districts) {
    await fetchAndSaveDistrictData(STATE_TO_PROCESS, districtName);
  }
  console.log("Data Ingestion Job Finished");
}

app.get('/', async (req, res) => {
  try {
    const translationsPath = path.join(__dirname, 'data', 'district-translations.json');
    const translationsFile = fs.readFileSync(translationsPath, 'utf-8');
    const districtMap = JSON.parse(translationsFile);
    const englishDistricts = await MgnregaRecord.distinct('district_name', {
      state_name: 'MAHARASHTRA',
    });
    const districtsForDropdown = englishDistricts.map(enName => ({
      en: enName,
      hi: districtMap[enName] || enName
    })).sort((a, b) => a.en.localeCompare(b.en));

    res.render('index', {
      districts: districtsForDropdown,
    });
  } catch (error) {
    console.error('Failed to load main page:', error.message);
    res.status(500).send('Error loading page. Please try again later.');
  }
});

app.get('/api/geocode', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Latitude and Longitude are required.' });
  }
  const API_KEY = process.env.LOCATIONIQ_API_KEY;
  const url = `https://us1.locationiq.com/v1/reverse.php?key=${API_KEY}&lat=${lat}&lon=${lon}&format=json`;
  try {
    const response = await axios.get(url);
    if (response.data && response.data.address) {
      const district = response.data.address.state_district;
      if (district) {
        const cleanedDistrict = district.replace(/ DISTRICT/i, '').toUpperCase();
        return res.json({ district: cleanedDistrict });
      }
    }
    return res.status(404).json({ error: 'District not found for these coordinates.' });
  } catch (error) {
    console.error('LocationIQ API error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch location data.' });
  }
});

app.get('/api/mgnrega', async (req, res) => {
  const { state: stateName, district: districtName } = req.query;
  if (!stateName || !districtName) {
    return res.status(400).json({ error: 'State and District are required.' });
  }
  try {
    const dbQuery = {
      state_name: stateName.toUpperCase(),
      district_name: districtName.toUpperCase(),
    };
    const records = await MgnregaRecord.find(dbQuery).sort({
      fin_year: -1,
      month: -1,
    });
    if (records.length === 0) {
      return res.json({ source: 'database', count: 0, data: [] });
    }
    return res.json({
      source: 'database',
      count: records.length,
      data: records,
    });
  } catch (error) {
    console.error('API database query failed:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch data from database.',
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  console.log("Running initial data ingestion on server start...");
  runDataIngestion();

  cron.schedule('0 2 * * *', () => {
    console.log("Running scheduled daily ingestion...");
    runDataIngestion();
  });
  
  console.log("Cron job scheduled: 2:00 AM UTC every day.");
});
