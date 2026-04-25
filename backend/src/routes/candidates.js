import { Router } from "express";
import multer      from "multer";
import path        from "path";
import fs          from "fs";
import { fileURLToPath } from "url";
import pool          from "../db/tempconnection.js";
import { authenticate } from "../middleware/authenticate.js";
import { analyzeCandidate } from "../services/geminiService.js";
import { extractCandidateName } from "../utils/resumeParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "../../uploads/resumes");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer — save files to disk with a unique name
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword", "text/plain"].includes(file.mimetype);
    cb(ok ? null : new Error("Unsupported file type."), ok);
  },
});

const router = Router({ mergeParams: true }); // gives access to :analysisId
router.use(authenticate);

// ── Ownership guard ───────────────────────────────────────────────────────────
async function requireAnalysis(req, res) {
  const [rows] = await pool.execute(
    "SELECT id, user_id, job_description FROM analyses WHERE id = ?",
    [req.params.analysisId]
  );
  if (!rows.length) { res.status(404).json({ error: "Analysis not found." }); return null; }
  if (rows[0].user_id !== req.user.id) { res.status(403).json({ error: "Access denied." }); return null; }
  return rows[0];
}

async function requireCandidate(req, res, analysis) {
  const [rows] = await pool.execute(
    "SELECT * FROM candidates WHERE id = ? AND analysis_id = ?",
    [req.params.candidateId, analysis.id]
  );
  if (!rows.length) { res.status(404).json({ error: "Candidate not found." }); return null; }
  return rows[0];
}

// ── POST / — add candidate ────────────────────────────────────────────────────
// Accepts multipart: file (resume) + optional resumeText (plain text paste)
router.post("/", upload.single("resume"), async (req, res) => {
  const analysis = await requireAnalysis(req, res);
  if (!analysis) return;

  const resumeText = req.body.resumeText?.trim() || "";
  const file       = req.file;

  if (!resumeText && !file) {
    return res.status(400).json({ error: "Provide a resume file or paste resume text." });
  }

  const text      = resumeText || req.body.extractedText || "";
  const name      = extractCandidateName(text, file?.originalname?.split(".")[0] || "New Candidate");
  const resumePath = file ? path.relative(path.join(__dirname, "../../"), file.path) : null;

  try {
    const [result] = await pool.execute(
      `INSERT INTO candidates (analysis_id, name, resume_text, resume_path, file_name, mime_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [analysis.id, name, text || null, resumePath, file?.originalname || null, file?.mimetype || null]
    );

    const [[candidate]] = await pool.execute("SELECT * FROM candidates WHERE id = ?", [result.insertId]);
    return res.status(201).json({ candidate: formatCandidate(candidate) });
  } catch (err) {
    // Clean up uploaded file on DB error
    if (file) fs.unlink(file.path, () => {});
    console.error("[POST /candidates]", err.message);
    return res.status(500).json({ error: "Failed to add candidate." });
  }
});

// ── PATCH /:candidateId/name ─────────────────────────────────────────────────
router.patch("/:candidateId/name", async (req, res) => {
  const analysis  = await requireAnalysis(req, res);
  if (!analysis) return;
  const candidate = await requireCandidate(req, res, analysis);
  if (!candidate) return;

  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Name is required." });

  try {
    await pool.execute("UPDATE candidates SET name = ? WHERE id = ?", [name.trim().slice(0, 150), candidate.id]);
    return res.json({ ok: true, name: name.trim() });
  } catch (err) {
    return res.status(500).json({ error: "Failed to rename candidate." });
  }
});

// ── DELETE /:candidateId ──────────────────────────────────────────────────────
router.delete("/:candidateId", async (req, res) => {
  const analysis  = await requireAnalysis(req, res);
  if (!analysis) return;
  const candidate = await requireCandidate(req, res, analysis);
  if (!candidate) return;

  try {
    // Delete stored resume file if it exists
    if (candidate.resume_path) {
      const abs = path.join(__dirname, "../../", candidate.resume_path);
      fs.unlink(abs, () => {}); // best-effort
    }
    await pool.execute("DELETE FROM candidates WHERE id = ?", [candidate.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /candidates/:id]", err.message);
    return res.status(500).json({ error: "Failed to remove candidate." });
  }
});

// ── POST /:candidateId/analyze ────────────────────────────────────────────────
// Runs (or re-runs) Gemini analysis for one candidate.
// Also saves AI-generated interview questions to DB.
router.post("/:candidateId/analyze", async (req, res) => {
  const analysis  = await requireAnalysis(req, res);
  if (!analysis) return;
  const candidate = await requireCandidate(req, res, analysis);
  if (!candidate) return;

  if (!candidate.resume_text?.trim()) {
    return res.status(400).json({ error: "Candidate has no resume text. Upload a resume first." });
  }
  if (!analysis.job_description?.trim()) {
    return res.status(400).json({ error: "Analysis has no job description." });
  }

  // Global questions to inject (passed from frontend question bank)
  let globalQuestions = [];
  try { globalQuestions = JSON.parse(req.body.globalQuestions || "[]"); } catch {}

  try {
    const geminiResult = await analyzeCandidate(analysis.job_description, candidate.resume_text);

    // Upsert result row
    await pool.execute(
      `INSERT INTO analysis_results (candidate_id, result_json, match_score, is_outdated)
       VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE result_json = VALUES(result_json),
                               match_score = VALUES(match_score),
                               is_outdated = 0,
                               analyzed_at = NOW()`,
      [candidate.id, JSON.stringify(geminiResult), geminiResult.matchScore ?? 0]
    );

    // Replace AI-generated interview questions (keep custom/global ones)
    await pool.execute(
      "DELETE FROM interview_questions WHERE candidate_id = ? AND is_global = 0",
      [candidate.id]
    );

    // Insert AI questions
    const aiQuestions = (geminiResult.suggestedQuestions || []).map((q, i) => [
      candidate.id,
      `[${q.category}] ${q.question}`,
      q.category,
      0,  // is_global
      i,  // sort_order
    ]);

    // Insert global questions from bank
    const gqRows = (globalQuestions).map((q, i) => [
      candidate.id,
      `[${q.category}] ${q.text}`,
      q.category,
      1,  // is_global
      aiQuestions.length + i,
    ]);

    const allQRows = [...aiQuestions, ...gqRows];
    if (allQRows.length) {
      const placeholders = allQRows.map(() => "(?,?,?,?,?)").join(",");
      await pool.execute(
        `INSERT INTO interview_questions (candidate_id, question, category, is_global, sort_order) VALUES ${placeholders}`,
        allQRows.flat()
      );
    }

    // Auto-update candidate name from resume if still default
    if (candidate.name === "New Candidate") {
      const inferredName = extractCandidateName(candidate.resume_text, candidate.name);
      if (inferredName !== candidate.name) {
        await pool.execute("UPDATE candidates SET name = ? WHERE id = ?", [inferredName, candidate.id]);
      }
    }

    // Return full candidate with result + questions
    const [[updatedCandidate]] = await pool.execute("SELECT * FROM candidates WHERE id = ?", [candidate.id]);
    const [[resultRow]]        = await pool.execute("SELECT * FROM analysis_results WHERE candidate_id = ?", [candidate.id]);
    const [questions]          = await pool.execute(
      "SELECT * FROM interview_questions WHERE candidate_id = ? ORDER BY sort_order ASC",
      [candidate.id]
    );

    return res.json({
      candidate: formatCandidate(updatedCandidate),
      result:    JSON.parse(resultRow.result_json),
      isOutdated: false,
      analyzedAt: resultRow.analyzed_at,
      interviewQuestions: questions.map(formatQuestion),
    });
  } catch (err) {
    console.error("[POST /candidates/:id/analyze]", err.message);
    return res.status(502).json({ error: "Analysis failed. " + err.message });
  }
});

// ── POST /:candidateId/questions ──────────────────────────────────────────────
router.post("/:candidateId/questions", async (req, res) => {
  const analysis  = await requireAnalysis(req, res);
  if (!analysis) return;
  const candidate = await requireCandidate(req, res, analysis);
  if (!candidate) return;

  const { question, category = "Custom", isGlobal = false } = req.body;
  if (!question?.trim()) return res.status(400).json({ error: "question is required." });

  try {
    const [[{ maxOrder }]] = await pool.execute(
      "SELECT COALESCE(MAX(sort_order),0)+1 AS maxOrder FROM interview_questions WHERE candidate_id = ?",
      [candidate.id]
    );
    const [r] = await pool.execute(
      "INSERT INTO interview_questions (candidate_id, question, category, is_global, sort_order) VALUES (?,?,?,?,?)",
      [candidate.id, question.trim(), category, isGlobal ? 1 : 0, maxOrder]
    );
    const [[row]] = await pool.execute("SELECT * FROM interview_questions WHERE id = ?", [r.insertId]);
    return res.status(201).json({ question: formatQuestion(row) });
  } catch (err) {
    return res.status(500).json({ error: "Failed to add question." });
  }
});

// ── PUT /:candidateId/questions/:qId ─────────────────────────────────────────
// Autosave: called on answer/rating change (debounced from frontend)
router.put("/:candidateId/questions/:qId", async (req, res) => {
  const analysis  = await requireAnalysis(req, res);
  if (!analysis) return;
  const candidate = await requireCandidate(req, res, analysis);
  if (!candidate) return;

  const [rows] = await pool.execute(
    "SELECT * FROM interview_questions WHERE id = ? AND candidate_id = ?",
    [req.params.qId, candidate.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Question not found." });

  const { answer, rating } = req.body;
  const updates = [];
  const vals    = [];

  if (answer !== undefined) { updates.push("answer = ?"); vals.push(answer); }
  if (rating !== undefined) { updates.push("rating = ?"); vals.push(Number(rating)); }

  if (!updates.length) return res.status(400).json({ error: "Nothing to update." });

  try {
    await pool.execute(
      `UPDATE interview_questions SET ${updates.join(", ")} WHERE id = ?`,
      [...vals, rows[0].id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update question." });
  }
});

// ── DELETE /:candidateId/questions/:qId ──────────────────────────────────────
router.delete("/:candidateId/questions/:qId", async (req, res) => {
  const analysis  = await requireAnalysis(req, res);
  if (!analysis) return;
  const candidate = await requireCandidate(req, res, analysis);
  if (!candidate) return;

  try {
    await pool.execute(
      "DELETE FROM interview_questions WHERE id = ? AND candidate_id = ?",
      [req.params.qId, candidate.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete question." });
  }
});

// ── Formatters ────────────────────────────────────────────────────────────────
function formatCandidate(c) {
  return {
    id:         c.id,
    name:       c.name,
    resumeText: c.resume_text || "",   // plain text for display in UI
    fileName:   c.file_name,
    mimeType:   c.mime_type,
    resumePath: c.resume_path,
    createdAt:  c.created_at,
    updatedAt:  c.updated_at,
  };
}

function formatQuestion(q) {
  return {
    id:       q.id,
    question: q.question,
    category: q.category,
    answer:   q.answer || "",
    rating:   q.rating,
    isGlobal: !!q.is_global,
  };
}

export default router;