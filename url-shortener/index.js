
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { nanoid } from "nanoid";

dotenv.config();

const app = express();

app.use(express.json({ limit: "10kb" }));

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Database model
const urlSchema = new mongoose.Schema(
  {
    originalUrl: {
      type: String,
      required: true,
      maxlength: 2048
    },
    shortCode: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    clicks: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

const Url = mongoose.model("Url", urlSchema);

// Validate HTTP/HTTPS URLs
function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Create a short URL
app.post("/api/shorten", async (req, res) => {
  try {
    const { originalUrl } = req.body;

    if (typeof originalUrl !== "string" || !isValidUrl(originalUrl)) {
      return res.status(400).json({
        error: "Please provide a valid HTTP or HTTPS URL."
      });
    }

    // Generate a unique short code
    let shortCode;
    let exists = true;

    while (exists) {
      shortCode = nanoid(7);
      exists = await Url.exists({ shortCode });
    }

    const url = await Url.create({
      originalUrl,
      shortCode
    });

    return res.status(201).json({
      originalUrl: url.originalUrl,
      shortCode: url.shortCode,
      shortUrl: `${BASE_URL}/${url.shortCode}`,
      clicks: url.clicks
    });
  } catch (error) {
    console.error("Shorten error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Redirect to original URL and increment clicks
app.get("/:shortCode", async (req, res) => {
  try {
    const url = await Url.findOneAndUpdate(
      { shortCode: req.params.shortCode },
      { $inc: { clicks: 1 } },
      { new: true }
    );

    if (!url) {
      return res.status(404).send("Short URL not found");
    }

    return res.redirect(302, url.originalUrl);
  } catch (error) {
    console.error("Redirect error:", error.message);
    return res.status(500).send("Internal server error");
  }
});

// Retrieve URL statistics
app.get("/api/stats/:shortCode", async (req, res) => {
  try {
    const url = await Url.findOne({
      shortCode: req.params.shortCode
    }).lean();

    if (!url) {
      return res.status(404).json({ error: "URL not found" });
    }

    return res.json({
      originalUrl: url.originalUrl,
      shortCode: url.shortCode,
      shortUrl: `${BASE_URL}/${url.shortCode}`,
      clicks: url.clicks,
      createdAt: url.createdAt
    });
  } catch (error) {
    console.error("Stats error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Connect to MongoDB before accepting requests
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected");

    app.listen(PORT, () => {
      console.log(`Server running at ${BASE_URL}`);
    });
  } catch (error) {
    console.error("Could not start server:", error.message);
    process.exit(1);
  }
}

startServer();
