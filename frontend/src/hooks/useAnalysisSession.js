import { useState, useCallback, useRef } from "react";
import {
  fetchAnalysis, updateJd, analyzeOne,
  addCandidate, deleteCandidate, renameCandidate,
  addQuestion, updateQuestion, deleteQuestion,
} from "../services/analysisService.js";
import { extractTextFromFile } from "../utils/fileParser.js";
import { extractCandidateName } from "../utils/resumeParser.js";

// Debounce helper — returns a function that delays calling fn by ms
function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

export function useAnalysisSession() {
  const [analysisId,    setAnalysisId]    = useState(null);
  const [jd,            setJdLocal]       = useState("");
  const [jdTitle,       setJdTitle]       = useState("");
  const [candidates,    setCandidates]    = useState([]);
  const [selectedId,    setSelectedId]    = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [jdSaving,      setJdSaving]      = useState(false);
  const [jdOutdated,    setJdOutdated]    = useState(false); // JD changed after results exist
  const [elapsedTime,   setElapsedTime]   = useState(0);

  const timerRef   = useRef(null);
  const analysisRef = useRef(null); // always holds current analysisId

  // ── Load a full analysis from backend ─────────────────────────────────────
  const loadAnalysis = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalysis(id);
      analysisRef.current = id;
      setAnalysisId(id);
      setJdLocal(data.analysis.jobDescription || "");
      setJdTitle(data.analysis.title || "");
      setCandidates(data.candidates || []);
      setSelectedId(data.candidates?.[0]?.id ?? null);
      // Check if any result is outdated
      setJdOutdated(data.candidates.some((c) => c.isOutdated));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Clear session (new analysis created externally) ───────────────────────
  const openAnalysis = useCallback((analysis) => {
    if (!analysis) {
      setAnalysisId(null);
      setJdLocal("");
      setJdTitle("");
      setCandidates([]);
      setSelectedId(null);
      setJdOutdated(false);
      return;
    }
    loadAnalysis(analysis.id);
  }, [loadAnalysis]);

  // ── JD changes — debounced autosave (1.5s) ────────────────────────────────
  const saveJdToBackend = useCallback(
    debounce(async (id, text) => {
      if (!id) return;
      setJdSaving(true);
      try {
        const res = await updateJd(id, text);
        if (res.jdChanged && res.outdatedCount > 0) {
          setJdOutdated(true);
          // Mark candidates as outdated in local state too
          setCandidates((prev) =>
            prev.map((c) => c.result ? { ...c, isOutdated: true } : c)
          );
        }
      } catch (e) {
        console.error("JD autosave failed:", e.message);
      } finally {
        setJdSaving(false);
      }
    }, 1500),
    []
  );

  const setJd = useCallback((text) => {
    setJdLocal(text);
    if (analysisRef.current) saveJdToBackend(analysisRef.current, text);
  }, [saveJdToBackend]);

  // ── Add candidate (upload file or paste text) ─────────────────────────────
  const handleResumeUpload = useCallback(async (file) => {
    if (!analysisRef.current) return;
    setError(null);
    try {
      const text = await extractTextFromFile(file);
      if (!text.trim()) throw new Error("Could not extract text from the file.");
      const data = await addCandidate(analysisRef.current, file, text);
      setCandidates((prev) => [...prev, {
        ...data.candidate,
        resumeText: text,          // keep extracted text for immediate display
        result: null,
        interviewQuestions: [],
        isOutdated: false,
      }]);
      setSelectedId(data.candidate.id);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleTextResume = useCallback(async (text, name = "New Candidate") => {
    if (!analysisRef.current || !text.trim()) return;
    setError(null);
    try {
      const data = await addCandidate(analysisRef.current, null, text);
      setCandidates((prev) => [...prev, {
        ...data.candidate,
        resumeText: text,
        result: null,
        interviewQuestions: [],
        isOutdated: false,
      }]);
      setSelectedId(data.candidate.id);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // ── Remove candidate ──────────────────────────────────────────────────────
  const removeCandidateById = useCallback(async (candidateId) => {
    if (!analysisRef.current) return;
    try {
      await deleteCandidate(analysisRef.current, candidateId);
      setCandidates((prev) => {
        const next = prev.filter((c) => c.id !== candidateId);
        if (selectedId === candidateId) setSelectedId(next[0]?.id ?? null);
        return next;
      });
    } catch (e) {
      setError(e.message);
    }
  }, [selectedId]);

  // ── Run analysis ──────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async (candidateId, globalQuestions = []) => {
    const id = candidateId ?? selectedId;
    if (!id || !analysisRef.current) return;

    // Start timer
    setElapsedTime(0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedTime((t) => t + 1), 1000);

    setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, isAnalyzing: true } : c));
    setError(null);

    try {
      const data = await analyzeOne(analysisRef.current, id, globalQuestions);
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                ...data.candidate,
                result: data.result,
                interviewQuestions: data.interviewQuestions,
                isOutdated: false,
                isAnalyzing: false,
                analyzedAt: data.analyzedAt,
              }
            : c
        )
      );
      setJdOutdated(false); // at least one fresh result now
    } catch (e) {
      setError(e.message);
      setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, isAnalyzing: false } : c));
    } finally {
      clearInterval(timerRef.current);
    }
  }, [selectedId]);

  // ── Interview question mutations (autosave answer/rating) ─────────────────
  const addInterviewQuestion = useCallback(async (text, category = "Custom", isGlobal = false) => {
    if (!analysisRef.current || !selectedId) return;
    try {
      const data = await addQuestion(analysisRef.current, selectedId, text, category, isGlobal);
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, interviewQuestions: [...(c.interviewQuestions || []), data.question] }
            : c
        )
      );
    } catch (e) {
      setError(e.message);
    }
  }, [selectedId]);

  // Debounced autosave for answer/rating changes
  const autosaveQuestion = useCallback(
    debounce(async (analysisId, candidateId, questionId, updates) => {
      try { await updateQuestion(analysisId, candidateId, questionId, updates); }
      catch (e) { console.error("Question autosave failed:", e.message); }
    }, 800),
    []
  );

  const updateInterviewQuestion = useCallback((questionId, updates) => {
    if (!selectedId) return;
    // Optimistic update
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? {
              ...c,
              interviewQuestions: c.interviewQuestions.map((q) =>
                q.id === questionId ? { ...q, ...updates } : q
              ),
            }
          : c
      )
    );
    // Persist after debounce
    if (analysisRef.current) {
      autosaveQuestion(analysisRef.current, selectedId, questionId, updates);
    }
  }, [selectedId, autosaveQuestion]);

  const removeInterviewQuestion = useCallback(async (questionId) => {
    if (!analysisRef.current || !selectedId) return;
    try {
      await deleteQuestion(analysisRef.current, selectedId, questionId);
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, interviewQuestions: c.interviewQuestions.filter((q) => q.id !== questionId) }
            : c
        )
      );
    } catch (e) {
      setError(e.message);
    }
  }, [selectedId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedCandidate  = candidates.find((c) => c.id === selectedId) ?? null;
  const isAnalyzing        = selectedCandidate?.isAnalyzing ?? false;
  const hasAnyResult       = candidates.some((c) => c.result);

  return {
    // State
    analysisId,
    jd, jdTitle, jdSaving, jdOutdated,
    candidates, selectedId, selectedCandidate,
    loading, error, setError,
    elapsedTime,
    isAnalyzing, hasAnyResult,

    // Actions
    openAnalysis,
    loadAnalysis,
    setJd,
    setSelectedId,
    handleResumeUpload,
    handleTextResume,
    removeCandidateById,
    handleAnalyze,
    addInterviewQuestion,
    updateInterviewQuestion,
    removeInterviewQuestion,
  };
}