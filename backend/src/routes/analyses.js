
import { Router }   from "express";
import { createHash } from "crypto";
import pool          from "../db/tempconnection.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();
router.use(authenticate); // all routes require JWT

// ── Helpers ───────────────────────────────────────────────────────────────────

function jdHash(text) {
  return createHash("sha256").update(text.trim()).digest("hex");
}

// Auto-title: first non-empty line of JD, truncated to 60 chars
function autoTitle(jd) {
  const first = jd.split("\n").find((l) => l.trim());
  return first ? first.trim().slice(0, 60) : "Untitled Analysis";
}

// Verify the analysis belongs to req.user.id — returns row or sends 403/404
async function requireOwnership(req, res, analysisId) {
  const [rows] = await pool.execute(
    "SELECT id, user_id, title, job_description, jd_hash, created_at, updated_at FROM analyses WHERE id = ?",
    [analysisId]
  );
  if (!rows.length) {
    res.status(404).json({ error: "Analysis not found." });
    return null;
  }
  if (rows[0].user_id !== req.user.id) {
    res.status(403).json({ error: "Access denied." });
    return null;
  }
  return rows[0];
}

// ── GET /api/analyses ─────────────────────────────────────────────────────────
// Returns lightweight list for sidebar (no full JD text, no results JSON)
router.get("/", async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page  || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20")));
  const offset = (page - 1) * limit;

  try {
    // Main list
    const [rows] = await pool.execute(
      `SELECT
         a.id,
         a.title,
         a.updated_at,
         a.created_at,
         COUNT(c.id)                                  AS candidate_count,
         SUM(CASE WHEN ar.id IS NOT NULL THEN 1 END)  AS analyzed_count,
         SUM(CASE WHEN ar.is_outdated = 1 THEN 1 END) AS outdated_count
       FROM analyses a
       LEFT JOIN candidates c  ON c.analysis_id = a.id
       LEFT JOIN analysis_results ar ON ar.candidate_id = c.id
       WHERE a.user_id = ?
       GROUP BY a.id
       ORDER BY a.updated_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );

    // Total count for pagination
    const [[{ total }]] = await pool.execute(
      "SELECT COUNT(*) AS total FROM analyses WHERE user_id = ?",
      [req.user.id]
    );

    return res.json({
      analyses: rows,
      pagination: { page, limit, total: Number(total), pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[GET /api/analyses]", err.message);
    return res.status(500).json({ error: "Failed to fetch analyses." });
  }
});

// ── POST /api/analyses ────────────────────────────────────────────────────────
// Create a new analysis session (called from "New Analysis" button)
router.post("/", async (req, res) => {
  const { job_description = "", title } = req.body;

  const jd    = job_description.trim();
  const hash  = jdHash(jd || " ");
  const name  = (title?.trim()) || autoTitle(jd) || "Untitled Analysis";

  try {
    const [result] = await pool.execute(
      "INSERT INTO analyses (user_id, title, job_description, jd_hash) VALUES (?, ?, ?, ?)",
      [req.user.id, name, jd, hash]
    );
    const id = result.insertId;

    const [[row]] = await pool.execute("SELECT * FROM analyses WHERE id = ?", [id]);
    return res.status(201).json({ analysis: row });
  } catch (err) {
    console.error("[POST /api/analyses]", err.message);
    return res.status(500).json({ error: "Failed to create analysis." });
  }
});

// ── GET /api/analyses/:id ─────────────────────────────────────────────────────
// Full analysis with all candidates, their results, and their questions
router.get("/:id", async (req, res) => {
  const analysis = await requireOwnership(req, res, req.params.id);
  if (!analysis) return;

  try {
    // Candidates
    const [candidates] = await pool.execute(
      `SELECT
         c.id, c.name, c.file_name, c.mime_type, c.resume_path,
         c.created_at, c.updated_at,
         ar.result_json, ar.match_score, ar.is_outdated, ar.analyzed_at
       FROM candidates c
       LEFT JOIN analysis_results ar ON ar.candidate_id = c.id
       WHERE c.analysis_id = ?
       ORDER BY c.created_at ASC`,
      [analysis.id]
    );

    // Questions for all candidates in one query
    const candidateIds = candidates.map((c) => c.id);
    let questionMap = {};
    if (candidateIds.length) {
      const placeholders = candidateIds.map(() => "?").join(",");
      const [questions] = await pool.execute(
        `SELECT * FROM interview_questions
         WHERE candidate_id IN (${placeholders})
         ORDER BY sort_order ASC, created_at ASC`,
        candidateIds
      );
      for (const q of questions) {
        if (!questionMap[q.candidate_id]) questionMap[q.candidate_id] = [];
        questionMap[q.candidate_id].push(q);
      }
    }

    // Shape the response
    const enriched = candidates.map((c) => ({
      id:          c.id,
      name:        c.name,
      fileName:    c.file_name,
      mimeType:    c.mime_type,
      resumePath:  c.resume_path,
      createdAt:   c.created_at,
      updatedAt:   c.updated_at,
      result:      c.result_json ? JSON.parse(c.result_json) : null,
      matchScore:  c.match_score,
      isOutdated:  !!c.is_outdated,
      analyzedAt:  c.analyzed_at,
      interviewQuestions: (questionMap[c.id] || []).map((q) => ({
        id:       q.id,
        question: q.question,
        category: q.category,
        answer:   q.answer || "",
        rating:   q.rating,
        isGlobal: !!q.is_global,
      })),
    }));

    return res.json({
      analysis: {
        id:             analysis.id,
        title:          analysis.title,
        jobDescription: analysis.job_description,
        jdHash:         analysis.jd_hash,
        createdAt:      analysis.created_at,
        updatedAt:      analysis.updated_at,
      },
      candidates: enriched,
    });
  } catch (err) {
    console.error("[GET /api/analyses/:id]", err.message);
    return res.status(500).json({ error: "Failed to fetch analysis." });
  }
});

// ── PATCH /api/analyses/:id/title ─────────────────────────────────────────────
router.patch("/:id/title", async (req, res) => {
  const analysis = await requireOwnership(req, res, req.params.id);
  if (!analysis) return;

  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required." });

  try {
    await pool.execute("UPDATE analyses SET title = ? WHERE id = ?", [title.trim().slice(0, 255), analysis.id]);
    return res.json({ ok: true, title: title.trim() });
  } catch (err) {
    console.error("[PATCH /api/analyses/:id/title]", err.message);
    return res.status(500).json({ error: "Failed to rename." });
  }
});

// ── PUT /api/analyses/:id/jd ──────────────────────────────────────────────────
// Update the job description.
// If the JD actually changed, mark all existing results as outdated.
router.put("/:id/jd", async (req, res) => {
  const analysis = await requireOwnership(req, res, req.params.id);
  if (!analysis) return;

  const { job_description } = req.body;
  if (!job_description?.trim()) return res.status(400).json({ error: "job_description is required." });

  const newHash = jdHash(job_description);
  const jdChanged = newHash !== analysis.jd_hash;

  try {
    // Auto-update title if it was previously auto-generated from JD
    const newTitle = autoTitle(job_description);

    await pool.execute(
      "UPDATE analyses SET job_description = ?, jd_hash = ?, title = ?, updated_at = NOW() WHERE id = ?",
      [job_description.trim(), newHash, newTitle, analysis.id]
    );

    let outdatedCount = 0;
    if (jdChanged) {
      // Mark all results for this analysis as outdated
      const [upd] = await pool.execute(
        `UPDATE analysis_results ar
         INNER JOIN candidates c ON c.id = ar.candidate_id
         SET ar.is_outdated = 1
         WHERE c.analysis_id = ?`,
        [analysis.id]
      );
      outdatedCount = upd.affectedRows;
    }

    return res.json({ ok: true, jdChanged, outdatedCount });
  } catch (err) {
    console.error("[PUT /api/analyses/:id/jd]", err.message);
    return res.status(500).json({ error: "Failed to update JD." });
  }
});

// ── DELETE /api/analyses/:id ──────────────────────────────────────────────────
// Cascade deletes candidates → results → questions automatically via FK constraints
router.delete("/:id", async (req, res) => {
  const analysis = await requireOwnership(req, res, req.params.id);
  if (!analysis) return;

  try {
    await pool.execute("DELETE FROM analyses WHERE id = ?", [analysis.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/analyses/:id]", err.message);
    return res.status(500).json({ error: "Failed to delete analysis." });
  }
});

export default router;