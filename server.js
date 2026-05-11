import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "./db.js";
import speedTestRouter from "./routes/speed-test.js";
import uploadRouter from "./routes/upload.js";
import interviewsRouter from "./routes/interviews.js";
import emailRouter from "./routes/email.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Static files (frontend)
app.use(express.static(path.join(__dirname, "public")));

// Serve uploaded files
app.use("/files", express.static(path.join(__dirname, "uploads")));

// API routes
app.use("/api", speedTestRouter);
app.use("/api", uploadRouter);
app.use("/api", interviewsRouter);
app.use("/api", emailRouter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, db: !!getDb() });
});

// Fallback to index.html for SPA-like behavior
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Init DB on startup
getDb();

app.listen(PORT, () => {
  console.log(`Azzurro AI Interview server running on http://localhost:${PORT}`);
});
