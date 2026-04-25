import { Router } from "express";
import { analyzeCandidate } from "../services/geminiService.js";

const router = Router();

router.post("/analyze-internal", async (req, res) => {
  console.log("🔥 INTERNAL ROUTE HIT");

  const { jd, resume } = req.body;

  if (!jd?.trim() || !resume?.trim()) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const result = await analyzeCandidate(jd, resume);

    return res.json({
      match_percentage: result.matchScore,
      verdict: result.proceedVerdict,
      full_data: result
    });

  } catch (err) {
    return res.status(500).json({ error: "AI failed" });
  }
});

export default router;