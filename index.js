import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import axios from "axios";
import MgnregaRecord from "./models/MgnregaRecords.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("(Server) MongoDB connected"))
  .catch((err) =>
    console.error("(Server) MongoDB connection error:", err.message)
  );

app.get("/", async (req, res) => {
  try {
    const translationsPath = path.join(
      __dirname,
      "data",
      "district-translations.json"
    );
    const translationsFile = fs.readFileSync(translationsPath, "utf-8");
    const districtMap = JSON.parse(translationsFile);

    const englishDistricts = await MgnregaRecord.distinct("district_name", {
      state_name: "MAHARASHTRA",
    });

    const districtsForDropdown = englishDistricts.map((enName) => {
      return {
        en: enName,
        hi: districtMap[enName] || enName,
      };
    });

    districtsForDropdown.sort((a, b) => a.en.localeCompare(b.en));

    res.render("index", {
      districts: districtsForDropdown,
    });
  } catch (error) {
    console.error("Failed to load main page:", error.message);
    res.status(500).send("Error loading page. Please try again later.");
  }
});

app.get("/api/geocode", async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res
      .status(400)
      .json({ error: "Latitude and Longitude are required." });
  }

  const API_KEY = process.env.LOCATIONIQ_API_KEY;
  const url = `https://us1.locationiq.com/v1/reverse.php?key=${API_KEY}&lat=${lat}&lon=${lon}&format=json`;

  try {
    const response = await axios.get(url);
    if (response.data && response.data.address) {
      const district = response.data.address.state_district;

      if (district) {
        const cleanedDistrict = district
          .replace(/ DISTRICT/i, "")
          .toUpperCase();
        return res.json({ district: cleanedDistrict });
      }
    }
    return res
      .status(404)
      .json({ error: "District not found for these coordinates." });
  } catch (error) {
    console.error("LocationIQ API error:", error.message);
    return res.status(500).json({ error: "Failed to fetch location data." });
  }
});

app.get("/api/mgnrega", async (req, res) => {
  const { state: stateName, district: districtName } = req.query;

  if (!stateName || !districtName) {
    return res.status(400).json({ error: "State and District are required." });
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
      return res.json({ source: "database", count: 0, data: [] });
    }

    return res.json({
      source: "database",
      count: records.length,
      data: records,
    });
  } catch (error) {
    console.error("❌ API database query failed:", error.message);
    return res.status(500).json({
      error: "Failed to fetch data from database.",
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
