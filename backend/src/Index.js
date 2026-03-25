import "dotenv/config";
import express from "express";
import cors    from "cors";
import path    from "path";
import { fileURLToPath } from "url";
import { testConnection }  from "./db/tempconnection.js";
import authRouter          from "./routes/auth.js";
import analysesRouter      from "./routes/analyses.js";
import candidatesRouter    from "./routes/candidates.js";
import reportRouter        from "./routes/report.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const required = ["GEMINI_API_KEY", "JWT_SECRET",];
const missing  = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌  Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const app          = express();
const PORT         = Number(process.env.PORT) || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:5173";

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Serve uploaded resume files statically (used by PDF merge step)
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// JSON body parser — skip for multipart routes
app.use((req, res, next) => {
  const skip = req.path === "/api/report" || req.path === "/api/comparison";
  if (skip) return next();
  express.json({ limit: "4mb" })(req, res, next);
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",     authRouter);
app.use("/api/analyses", analysesRouter);
app.use("/api/analyses/:analysisId/candidates", candidatesRouter);
app.use("/api", reportRouter);

app.get("/health", (_req, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString() })
);
app.use((_req, res) => res.status(404).json({ error: "Route not found." }));

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`✅  TalentMatch API   →  http://localhost:${PORT}`);
    console.log(`   Analyses (sidebar) →  GET|POST /api/analyses`);
    console.log(`   Candidates          →  /api/analyses/:id/candidates`);
    console.log(`   Reports             →  POST /api/report | /api/comparison`);
    console.log(`   Auth                →  /api/auth/*`);
    console.log(`   Allowed origin      →  ${ALLOWED_ORIGIN}`);
  });
}
start();