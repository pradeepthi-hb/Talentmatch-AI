import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { downloadReport, downloadComparisonReport, resolveCandidateResumeFile } from "../services/reportService.js";
import { createAnalysis } from "../services/analysisService.js";
import {
  FileText, User, CheckCircle2, XCircle, AlertCircle, BarChart3,
  Loader2, Sparkles, ArrowRight, ClipboardList, Upload, FileUp,
  X, Download, MessageSquare, Star, Plus, Trash2, Briefcase,
  Award, LogOut, ChevronDown, Users, Timer, PanelLeft, RefreshCw,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { extractTextFromFile } from "../utils/fileParser.js";
import { useAnalysisSession } from "../hooks/useAnalysisSession.js";
import { useGlobalQuestions } from "../hooks/useGlobalquestions.js";

// ── Lazy heavy components ─────────────────────────────────────────────────────
const MotionDiv           = lazy(() => import("motion/react").then((m) => ({ default: m.motion.div })));
const AnimatePresenceComp = lazy(() => import("motion/react").then((m) => ({ default: m.AnimatePresence })));
const Markdown            = lazy(() => import("react-markdown"));
const MatchBreakdownChart = lazy(() => import("../components/MatchBreakdownChart.jsx"));
const ComparisonTab       = lazy(() => import("../components/ComparisonTab.jsx"));
const QuestionBank        = lazy(() => import("../components/QuestionBank.jsx"));
const AnalysisSidebar     = lazy(() => import("../components/AnalysisSidebar.jsx"));

function cn(...classes) { return classes.filter(Boolean).join(" "); }

function SpinnerFallback() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}

// ── Sample data ───────────────────────────────────────────────────────────────
const SAMPLE_JD = `Senior Frontend Engineer
Role Overview:
We are looking for a Senior Frontend Engineer with 5+ years of experience in React and TypeScript. You will be responsible for building highly interactive user interfaces and leading architectural decisions for our core product.

Requirements:
- Strong proficiency in React, TypeScript, and modern CSS (Tailwind preferred).
- Experience with state management libraries like Redux or Zustand.
- Knowledge of performance optimization and web accessibility.
- Excellent communication skills and experience mentoring junior developers.
- Experience with testing frameworks like Jest or Vitest.
`;

const SAMPLE_RESUME = `Alex Rivera
Senior Software Engineer | 6 Years Experience

Summary:
Passionate frontend developer focused on building scalable web applications. Expert in React ecosystem and performance tuning.

Experience:
TechFlow Solutions (2020 - Present)
- Led the migration of a legacy dashboard to React 18, improving load times by 40%.
- Mentored 4 junior developers and established code review standards.
- Built a custom UI component library using Tailwind CSS and Headless UI.

WebCraft Agency (2018 - 2020)
- Developed responsive websites for various clients using React and Redux.
- Implemented unit testing using Jest, achieving 85% coverage.

Skills:
React, TypeScript, JavaScript (ES6+), Tailwind CSS, Redux, Jest, Git, Webpack.
`;

// ─────────────────────────────────────────────────────────────────────────────
export default function AnalyzerPage() {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [jdFileName, setJdFileName] = useState(null);
  const [isExtractingJd, setIsExtractingJd] = useState(false);
  const [isExtractingResume, setIsExtractingResume] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [activeTab, setActiveTab] = useState("analysis");
  const [newQuestion, setNewQuestion] = useState("");

  const fileInputRef   = useRef(null);
  const jdFileInputRef = useRef(null);
  const questionSyncRef = useRef("");

  // ── Sidebar state ───────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Persisted analysis session ───────────────────────────────────────────
  const {
    analysisId,
    jd, setJd,
    jdSaving, jdOutdated,
    candidates,
    selectedId:        selectedCandidateId,
    selectedCandidate,
    setSelectedId:     setSelectedCandidateId,
    loading:           sessionLoading,
    error,             setError,
    elapsedTime,
    isAnalyzing,
    hasAnyResult,
    openAnalysis,
    handleResumeUpload,
    handleTextResume,
    removeCandidateById,
    handleAnalyze:     analyzeSelected,
    addInterviewQuestion,
    updateInterviewQuestion,
    removeInterviewQuestion,
  } = useAnalysisSession();

  const analysisStorageKey = user?.id ? `tm_active_analysis_${user.id}` : null;
  const questionBankStorageKey = user?.id
    ? `tm_question_bank_${user.id}_${analysisId || "draft"}`
    : null;

  // ── Global question bank ─────────────────────────────────────────────────
  const {
    questionBank,
    questionBankReady,
    addBankQuestion,
    removeBankQuestion,
    toggleApply,
    updateBankQuestion,
    toInterviewQuestions,
    activeGlobalQuestions,
  } = useGlobalQuestions(questionBankStorageKey);

  useEffect(() => {
    if (!analysisStorageKey) return;

    if (analysisId) {
      localStorage.setItem(analysisStorageKey, String(analysisId));
      return;
    }

    localStorage.removeItem(analysisStorageKey);
  }, [analysisId, analysisStorageKey]);

  useEffect(() => {
    if (!analysisStorageKey || analysisId || sessionLoading) return;

    const savedAnalysisId = localStorage.getItem(analysisStorageKey);
    if (savedAnalysisId) {
      openAnalysis({ id: savedAnalysisId });
    }
  }, [analysisId, analysisStorageKey, openAnalysis, sessionLoading]);

  useEffect(() => {
    if (!analysisId) {
      questionSyncRef.current = "";
    }
  }, [analysisId]);

  // Wrapper: run analysis injecting active global questions
  const handleAnalyze = (candidateId) =>
    analyzeSelected(candidateId, activeGlobalQuestions);

  const makeGlobalQuestionLabel = (question) => `[${question.category}] ${question.text}`;

  const syncBankQuestionAcrossAnalyzedCandidates = async (question, enabled) => {
    const analyzedCandidates = candidates.filter((candidate) => candidate.result);

    await Promise.all(
      analyzedCandidates.map(async (candidate) => {
        const label = makeGlobalQuestionLabel(question);
        const matches = (candidate.interviewQuestions || []).filter(
          (entry) => entry.isGlobal && entry.question === label
        );

        if (enabled) {
          if (!matches.length) {
            await addInterviewQuestion(question.text, question.category, true, candidate.id);
          }
          return;
        }

        await Promise.all(matches.map((entry) => removeInterviewQuestion(entry.id, candidate.id)));
      })
    );
  };

  const handleAddBankQuestion = async (text, category = "Custom") => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addBankQuestion(trimmed, category);
    await syncBankQuestionAcrossAnalyzedCandidates({ text: trimmed, category }, true);
  };

  const handleRemoveBankQuestion = async (id) => {
    const question = questionBank.find((entry) => entry.id === id);
    removeBankQuestion(id);
    if (question) {
      await syncBankQuestionAcrossAnalyzedCandidates(question, false);
    }
  };

  const handleToggleBankQuestion = async (id) => {
    const question = questionBank.find((entry) => entry.id === id);
    toggleApply(id);
    if (question) {
      await syncBankQuestionAcrossAnalyzedCandidates(question, !question.apply);
    }
  };

  const handleUpdateBankQuestion = async (id, updates) => {
    const previousQuestion = questionBank.find((entry) => entry.id === id);
    updateBankQuestion(id, updates);
    if (!previousQuestion) return;

    const nextQuestion = { ...previousQuestion, ...updates };
    await syncBankQuestionAcrossAnalyzedCandidates(previousQuestion, false);
    if (nextQuestion.apply) {
      await syncBankQuestionAcrossAnalyzedCandidates(nextQuestion, true);
    }
  };

  useEffect(() => {
    if (!analysisId || sessionLoading || !questionBankReady || !candidates.length) return;

    const syncKey = [
      analysisId,
      questionBankStorageKey,
      questionBank
        .map((question) => `${question.id}:${question.category}:${question.text}:${question.apply ? 1 : 0}`)
        .join("|"),
    ].join("::");

    if (questionSyncRef.current === syncKey) return;
    questionSyncRef.current = syncKey;

    const activeLabels = new Set(activeGlobalQuestions.map(makeGlobalQuestionLabel));
    const analyzedCandidates = candidates.filter((candidate) => candidate.result);

    const reconcile = async () => {
      await Promise.all(
        analyzedCandidates.map(async (candidate) => {
          const globalEntries = (candidate.interviewQuestions || []).filter((entry) => entry.isGlobal);
          const staleEntries = globalEntries.filter((entry) => !activeLabels.has(entry.question));

          await Promise.all(staleEntries.map((entry) => removeInterviewQuestion(entry.id, candidate.id)));

          await Promise.all(
            activeGlobalQuestions.map(async (question) => {
              const label = makeGlobalQuestionLabel(question);
              const exists = globalEntries.some((entry) => entry.question === label);
              if (!exists) {
                await addInterviewQuestion(question.text, question.category, true, candidate.id);
              }
            })
          );
        })
      );
    };

    reconcile();
  }, [
    analysisId,
    sessionLoading,
    questionBankReady,
    questionBankStorageKey,
    questionBank,
    addInterviewQuestion,
    removeInterviewQuestion,
  ]);

  const resumeText         = selectedCandidate?.resumeText ?? "";
  const fileName           = selectedCandidate?.fileName ?? null;
  const result             = selectedCandidate?.result ?? null;
  const interviewQuestions = selectedCandidate?.interviewQuestions ?? [];
  const analyzedCount      = candidates.filter((c) => c.result).length;
  const selectedCandidateName = selectedCandidate?.name ?? "No candidate selected";
  const selectedCandidateStatus = selectedCandidate?.result
    ? `${selectedCandidate.result.matchScore}% match`
    : selectedCandidate?.isOutdated
    ? "Needs re-analysis"
    : selectedCandidate
    ? "Ready for analysis"
    : "Select a candidate to preview their resume";

  // "Clear" just deselects the candidate visually — deletion is via the X in the list
  const clearResume = () => setSelectedCandidateId(null);

  const ratedQs = interviewQuestions.filter((q) => q.rating > 0);
  const avgRating = ratedQs.length > 0
    ? (ratedQs.reduce((a, q) => a + q.rating, 0) / ratedQs.length).toFixed(1)
    : "0.0";

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  // ── JD upload ──────────────────────────────────────────────────────────────
  const handleJdUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJdFileName(file.name);
    setIsExtractingJd(true);
    setError(null);
    try {
      const text = await extractTextFromFile(file);
      if (!text.trim()) throw new Error("Could not extract text from the JD file.");
      setJd(text); // triggers debounced autosave to backend
    } catch (err) {
      setError(err.message || "Failed to read JD file.");
      setJdFileName(null);
    } finally {
      setIsExtractingJd(false);
      if (jdFileInputRef.current) jdFileInputRef.current.value = "";
    }
  };

  // ── Resume upload ──────────────────────────────────────────────────────────
  const handleUploadResume = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!analysisId) {
      // Auto-create an analysis if none is open
      setError(null);
      try {
        const data = await createAnalysis(jd);
        await openAnalysis(data.analysis);
      } catch (err) {
        setError("Failed to create analysis session.");
        return;
      }
    }
    setIsExtractingResume(true);
    setError(null);
    try {
      await handleResumeUpload(file);
    } catch (err) {
      setError(err.message || "Failed to read resume file.");
    } finally {
      setIsExtractingResume(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Download single ────────────────────────────────────────────────────────
  const handleDownloadReport = async () => {
    if (!result || !selectedCandidate) return;
    setIsDownloading(true);
    setError(null);
    try {
      const fileToSend = await resolveCandidateResumeFile(selectedCandidate);
      const candidateName = selectedCandidate.name || "Candidate";
      const jobTitle = jd.split("\n").find((l) => l.trim())?.trim() ?? "";
      await downloadReport(result, interviewQuestions, fileToSend, candidateName, jobTitle);
    } catch (err) {
      setError(err.message || "Failed to generate report.");
    } finally {
      setIsDownloading(false);
    }
  };

  // ── Download ALL ───────────────────────────────────────────────────────────
  const handleDownloadAllReports = async () => {
    const analyzed = candidates.filter((c) => c.result);
    if (!analyzed.length) return;
    setIsDownloadingAll(true);
    setError(null);
    const jobTitle = jd.split("\n").find((l) => l.trim())?.trim() ?? "";
    for (const c of analyzed) {
      try {
        const fileToSend = await resolveCandidateResumeFile(c);
        const candidateName = c.name || "Candidate";
        await downloadReport(c.result, c.interviewQuestions, fileToSend, candidateName, jobTitle);
        await new Promise((r) => setTimeout(r, 600)); // stagger downloads
      } catch (err) {
        console.error(`Report failed for ${c.name}:`, err.message);
      }
    }
    setIsDownloadingAll(false);
  };

  // ── Download comparison PDF ────────────────────────────────────────────────
  const handleDownloadComparison = async () => {
    const jobTitle = jd.split("\n").find((l) => l.trim())?.trim() ?? "";
    await downloadComparisonReport(candidates, jobTitle);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    }>
    <>
    <Suspense fallback={null}>
      <AnalysisSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentAnalysisId={analysisId}
        onSelectAnalysis={(id) => { openAnalysis({ id }); setSidebarOpen(false); }}
        onNewAnalysis={(analysis) => { openAnalysis(analysis); setSidebarOpen(false); }}
      />
    </Suspense>

    <div className={cn(
      "min-h-screen bg-[#F3F4F6] text-slate-900 font-sans selection:bg-indigo-100 transition-all duration-300",
      sidebarOpen ? "lg:pl-72" : ""
    )}>

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Sparkles className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-none">TalentMatch AI</h1>
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Premium Talent Analytics</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-all px-3 py-2 rounded-lg hover:bg-slate-50"
              title="Open analysis history"
            >
              <PanelLeft className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </button>

            {/* Download ALL — visible when 2+ candidates analyzed */}
            {analyzedCount > 1 && (
              <button
                onClick={handleDownloadAllReports}
                disabled={isDownloadingAll}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md",
                  isDownloadingAll
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                    : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 active:scale-95"
                )}
              >
                {isDownloadingAll
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Downloading...</>
                  : <><Download className="w-4 h-4" /> All Reports ({analyzedCount})</>
                }
              </button>
            )}

            {/* Download single */}
            {result && (
              <button
                onClick={handleDownloadReport}
                disabled={isDownloading}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md",
                  isDownloading
                    ? "bg-slate-400 text-white cursor-not-allowed"
                    : "bg-slate-900 text-white hover:bg-slate-800 active:scale-95"
                )}
              >
                {isDownloading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Building PDF...</>
                  : <><Download className="w-4 h-4" /> Download Report</>
                }
              </button>
            )}

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center text-white text-xs font-black">
                  {initials}
                </div>
                <span className="hidden sm:block text-sm font-semibold text-slate-700 max-w-[120px] truncate">{user?.name}</span>
                <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showUserMenu && "rotate-180")} />
              </button>
              <Suspense fallback={null}>
                <AnimatePresenceComp>
                  {showUserMenu && (
                    <MotionDiv
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 p-2 z-50"
                    >
                      <div className="px-3 py-2 mb-1 border-b border-slate-100">
                        <p className="text-xs font-bold text-slate-900 truncate">{user?.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
                      </div>
                      <button
                        onClick={() => { setShowUserMenu(false); logout(); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <LogOut className="w-4 h-4" /> Sign Out
                      </button>
                    </MotionDiv>
                  )}
                </AnimatePresenceComp>
              </Suspense>
            </div>
          </div>
        </div>
      </header>

      {showUserMenu && <div className="fixed inset-0 z-20" onClick={() => setShowUserMenu(false)} />}

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-12 gap-8">

          {/* ── Left column ── */}
          <div className="lg:col-span-5 space-y-6">

            {/* Job Description */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-all">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-100 rounded-md text-indigo-600"><Briefcase className="w-4 h-4" /></div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Job Specification</h2>
                  {jdSaving && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" title="Saving..." />}
                  {!jdSaving && analysisId && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Saved" />}
                </div>
                <div className="flex items-center gap-2">
                  <input type="file" ref={jdFileInputRef} onChange={handleJdUpload} accept=".pdf,.docx,.txt" className="hidden" />
                  <button
                    onClick={() => jdFileInputRef.current?.click()}
                    disabled={isExtractingJd}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-lg transition-all hover:bg-indigo-100 disabled:opacity-70"
                  >
                    {isExtractingJd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {isExtractingJd ? "Processing..." : "Upload JD"}
                  </button>
                </div>
              </div>
              <div className="relative">
                {jdFileName && (
                  <div className="absolute top-4 right-4 z-10 flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full border border-slate-200 text-[10px] font-bold text-slate-600 shadow-sm">
                    <FileUp className="w-3 h-3 text-indigo-500" />
                    <span className="max-w-[120px] truncate">{jdFileName}</span>
                    <button onClick={() => { setJd(""); setJdFileName(null); }} className="hover:text-red-500 transition-colors p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <textarea
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the job description here or upload a document..."
                  className="w-full h-48 p-5 focus:outline-none resize-none text-slate-700 leading-relaxed text-sm placeholder:text-slate-300"
                />
              </div>
            </div>

            <input type="file" ref={fileInputRef} onChange={handleUploadResume} accept=".pdf,.docx,.txt" className="hidden" />

            {/* Candidates panel */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-all">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-100 rounded-md text-indigo-600"><Users className="w-4 h-4" /></div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    Candidate Library
                  </h2>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExtractingResume}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-lg transition-all hover:bg-indigo-100 disabled:opacity-70"
                >
                  {isExtractingResume
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Plus className="w-3.5 h-3.5" />
                  }
                  {isExtractingResume ? "Adding..." : "Add Candidate"}
                </button>
              </div>
              <div className="px-4 pt-4 pb-2 border-b border-slate-100 bg-white">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total</p>
                    <p className="mt-1 text-2xl font-black text-slate-900">{candidates.length}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Analyzed</p>
                    <p className="mt-1 text-2xl font-black text-indigo-600">{analyzedCount}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pending</p>
                    <p className="mt-1 text-2xl font-black text-amber-600">{Math.max(candidates.length - analyzedCount, 0)}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Upload resumes here to add new candidates. Select any candidate below to review their profile and analysis.
                </p>
              </div>
              <div className="p-2 max-h-64 overflow-y-auto">
                {candidates.length === 0 ? (
                  <p className="text-center py-6 text-slate-400 text-xs italic">No candidates added yet. Use Add Candidate to upload the first resume.</p>
                ) : (
                  <div className="space-y-1">
                    {candidates.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setSelectedCandidateId(c.id)}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all group",
                          selectedCandidateId === c.id
                            ? "bg-indigo-50 border border-indigo-100"
                            : "hover:bg-slate-50 border border-transparent"
                        )}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs",
                            selectedCandidateId === c.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                          )}>
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="overflow-hidden">
                            <p className={cn("text-xs font-bold truncate", selectedCandidateId === c.id ? "text-indigo-900" : "text-slate-700")}>
                              {c.name}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {c.fileName || (c.result ? "Analysis complete" : "Resume ready")}
                            </p>
                            {c.result && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-600" style={{ width: `${c.result.matchScore}%` }} />
                                </div>
                                <span className="text-[8px] font-black text-indigo-600">{c.result.matchScore}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeCandidateById(c.id); }}
                          className="p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Resume textarea */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-all">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-violet-100 rounded-md text-violet-600"><User className="w-4 h-4" /></div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Selected Candidate</h2>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-700 truncate max-w-[180px]">{selectedCandidateName}</p>
                  <p className="text-[10px] text-slate-400">{selectedCandidateStatus}</p>
                </div>
              </div>
              <div className="relative">
                {fileName && (
                  <div className="absolute top-4 right-4 z-10 flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full border border-slate-200 text-[10px] font-bold text-slate-600 shadow-sm">
                    <FileUp className="w-3 h-3 text-indigo-500" />
                    <span className="max-w-[120px] truncate">{fileName}</span>
                    <button onClick={clearResume} className="hover:text-red-500 transition-colors p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <textarea
                  value={resumeText}
                  readOnly
                  placeholder="Select a candidate to preview their resume here."
                  className="w-full h-64 p-5 focus:outline-none resize-none text-slate-700 leading-relaxed text-sm placeholder:text-slate-300 bg-slate-50/50"
                />
              </div>
            </div>

            {/* Question Bank */}
            <Suspense fallback={null}>
              <QuestionBank
                questionBank={questionBank}
                onAdd={handleAddBankQuestion}
                onRemove={handleRemoveBankQuestion}
                onToggle={handleToggleBankQuestion}
                onUpdate={handleUpdateBankQuestion}
              />
            </Suspense>


            {/* Analyze button */}
            <button
              onClick={() => handleAnalyze()}
              disabled={isAnalyzing || isExtractingJd || isExtractingResume}
              className={cn(
                "w-full py-4 rounded-2xl font-bold text-white transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-200 text-sm uppercase tracking-widest",
                isAnalyzing || isExtractingJd || isExtractingResume
                  ? "bg-slate-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98]"
              )}
            >
              {isAnalyzing
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating Intelligence...</>
                : <><BarChart3 className="w-5 h-5" /> Run Match Analysis</>
              }
            </button>

            {error && (
              <Suspense fallback={null}>
                <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-700">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium">{error}</p>
                </MotionDiv>
              </Suspense>
            )}
          </div>

          {/* ── Right column ── */}
          <div className="lg:col-span-7 space-y-6">

            {/* Tabs */}
            {hasAnyResult && (
              <div className="flex p-1 bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
                {[
                  { key: "analysis",   icon: BarChart3,     label: "AI Analysis" },
                  { key: "interview",  icon: MessageSquare, label: "Interview"    },
                  { key: "comparison", icon: Users,          label: "Comparison"  },
                ].map(({ key, icon: Icon, label }) => (
                  <button key={key} onClick={() => setActiveTab(key)}
                    className={cn(
                      "flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2",
                      activeTab === key ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                    {key === "interview" && ratedQs.length > 0 && (
                      <span className={cn("ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-black",
                        activeTab === "interview" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700")}>
                        {avgRating}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <Suspense fallback={<SpinnerFallback />}>
              <AnimatePresenceComp mode="wait">

                {/* Empty */}
                {!result && !isAnalyzing && activeTab !== "comparison" && (
                  <MotionDiv key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="h-[600px] flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-slate-300 rounded-3xl bg-white/50"
                  >
                    <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-xl mb-6 border border-slate-100">
                      <FileText className="w-10 h-10 text-slate-200" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">Ready for Analysis</h3>
                    <p className="text-slate-500 mt-3 max-w-sm text-sm leading-relaxed">
                      Add candidates from the candidate library, review the selected resume here, then run match analysis when the job description is ready.
                    </p>
                  </MotionDiv>
                )}

                {/* Loading */}
                {isAnalyzing && (
                  <MotionDiv key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="h-[600px] flex flex-col items-center justify-center p-12 space-y-8 bg-white rounded-3xl border border-slate-200"
                  >
                    <div className="relative">
                      <div className="w-32 h-32 border-8 border-indigo-50 rounded-full" />
                      <div className="absolute inset-0 w-32 h-32 border-8 border-indigo-600 rounded-full border-t-transparent animate-spin" />
                      <Sparkles className="absolute inset-0 m-auto w-10 h-10 text-indigo-600 animate-pulse" />
                    </div>
                    <div className="text-center space-y-3">
                      <h3 className="text-xl font-bold text-slate-900">Intelligence Engine Running</h3>
                      <div className="flex items-center justify-center gap-2 text-indigo-600 font-mono text-lg font-bold">
                        <Timer className="w-5 h-5" />{elapsedTime}s
                      </div>
                      <p className="text-slate-500 text-sm animate-pulse max-w-xs mx-auto">
                        Synthesizing skills, experience relevance, and cultural alignment...
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Typical analysis: 10–15 seconds</p>
                    </div>
                  </MotionDiv>
                )}

                {/* Analysis tab */}
                {result && activeTab === "analysis" && (
                  <MotionDiv key="analysis-tab" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

                    {/* Score + Verdict */}
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600" />
                        <div>
                          <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">AI Match Confidence</h3>
                          <div className="flex items-baseline gap-3 mt-2">
                            <span className="text-6xl font-black text-slate-900 tracking-tighter">{result.matchScore}%</span>
                            <div className={cn("text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest",
                              result.matchScore >= 80 ? "bg-emerald-100 text-emerald-700" :
                              result.matchScore >= 60 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700")}>
                              {result.matchScore >= 80 ? "Exceptional" : result.matchScore >= 60 ? "Qualified" : "Requires Review"}
                            </div>
                          </div>
                        </div>
                        <div className="w-28 h-28 relative hidden sm:block">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="56" cy="56" r="48" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-slate-100" />
                            <circle cx="56" cy="56" r="48" stroke="currentColor" strokeWidth="10" fill="transparent"
                              strokeDasharray={301.6} strokeDashoffset={301.6 - (301.6 * result.matchScore) / 100}
                              className="text-indigo-600 transition-all duration-1000 ease-out" strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <BarChart3 className="w-8 h-8 text-indigo-200" />
                          </div>
                        </div>
                      </div>

                      {result.proceedVerdict && (
                        <div className={cn("p-8 rounded-3xl border shadow-sm flex flex-col justify-center relative overflow-hidden",
                          result.proceedVerdict === "Proceed" ? "bg-emerald-50 border-emerald-100" :
                          result.proceedVerdict === "Maybe"   ? "bg-amber-50 border-amber-100"   : "bg-red-50 border-red-100")}>
                          <div className={cn("absolute top-0 left-0 w-2 h-full",
                            result.proceedVerdict === "Proceed" ? "bg-emerald-500" :
                            result.proceedVerdict === "Maybe"   ? "bg-amber-500"   : "bg-red-500")} />
                          <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Hiring Verdict</h3>
                          <div className="flex items-center gap-3 mt-2">
                            {result.proceedVerdict === "Proceed"
                              ? <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                              : result.proceedVerdict === "Maybe"
                              ? <AlertCircle className="w-8 h-8 text-amber-600" />
                              : <XCircle className="w-8 h-8 text-red-600" />
                            }
                            <span className={cn("text-3xl font-black tracking-tight",
                              result.proceedVerdict === "Proceed" ? "text-emerald-900" :
                              result.proceedVerdict === "Maybe"   ? "text-amber-900"   : "text-red-900")}>
                              {result.proceedVerdict === "Proceed" ? "PROCEED" : result.proceedVerdict === "Maybe" ? "CONSIDER" : "REJECT"}
                            </span>
                          </div>
                          {result.proceedReason && (
                            <p className="text-xs mt-2 text-slate-600 font-medium leading-relaxed italic">"{result.proceedReason}"</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Match Breakdown Chart */}
                    {result.categoryScores && (
                      <Suspense fallback={<SpinnerFallback />}>
                        <MatchBreakdownChart categoryScores={result.categoryScores} />
                      </Suspense>
                    )}

                    {/* Summary */}
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                      <div className="flex items-center gap-2 mb-6">
                        <div className="p-2 bg-slate-100 rounded-lg text-slate-600"><FileText className="w-5 h-5" /></div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Strategic Overview</h3>
                      </div>
                      <div className="prose prose-slate prose-sm max-w-none text-slate-700 leading-relaxed">
                        <Suspense fallback={<p className="text-slate-400 text-sm animate-pulse">Loading summary...</p>}>
                          <Markdown>{result.summary}</Markdown>
                        </Suspense>
                      </div>
                    </div>

                    {/* Strengths & Gaps */}
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="bg-emerald-50/50 p-8 rounded-3xl border border-emerald-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600"><CheckCircle2 className="w-5 h-5" /></div>
                          <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-700">Top Strengths</h3>
                        </div>
                        <ul className="space-y-4">
                          {result.strengths.map((s, i) => (
                            <li key={i} className="text-sm text-slate-700 flex gap-3 font-medium">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-rose-50/50 p-8 rounded-3xl border border-rose-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="p-2 bg-rose-100 rounded-xl text-rose-600"><XCircle className="w-5 h-5" /></div>
                          <h3 className="text-xs font-bold uppercase tracking-widest text-rose-700">Critical Gaps</h3>
                        </div>
                        <ul className="space-y-4">
                          {result.gaps.map((g, i) => (
                            <li key={i} className="text-sm text-slate-700 flex gap-3 font-medium">
                              <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />{g}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Skills Matrix */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><Award className="w-5 h-5" /></div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Technical Skills Matrix</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50/50">
                              <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Skill / Competency</th>
                              <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Assessment</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {result.technicalSkillsMatch.map((skill, i) => (
                              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-8 py-5 text-sm font-bold text-slate-700">{skill.skill}</td>
                                <td className="px-8 py-5">
                                  <span className={cn("text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest inline-block",
                                    skill.level === "High"   ? "bg-emerald-100 text-emerald-700" :
                                    skill.level === "Medium" ? "bg-blue-100 text-blue-700"    :
                                    skill.level === "Low"    ? "bg-amber-100 text-amber-700"  :
                                                               "bg-slate-100 text-slate-500")}>
                                    {skill.level}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Recommendations */}
                    <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-10 rounded-3xl shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -mr-32 -mt-32 blur-3xl" />
                      <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-white/10 rounded-xl"><Sparkles className="w-6 h-6 text-indigo-300" /></div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-300">Strategic Recommendations</h3>
                      </div>
                      <ul className="space-y-6">
                        {result.recommendations.map((rec, i) => (
                          <li key={i} className="flex gap-4 items-start group">
                            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-white/10 transition-all border border-white/10">
                              <ArrowRight className="w-4 h-4 text-indigo-400" />
                            </div>
                            <p className="text-sm text-indigo-50/90 leading-relaxed font-medium">{rec}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </MotionDiv>
                )}

                {/* Comparison tab */}
                {activeTab === "comparison" && (
                  <MotionDiv key="comparison-tab" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <Suspense fallback={<SpinnerFallback />}>
                      <ComparisonTab candidates={candidates} onDownloadComparison={handleDownloadComparison} />
                    </Suspense>
                  </MotionDiv>
                )}

                {/* Interview tab */}
                {result && activeTab === "interview" && (
                  <MotionDiv key="interview-tab" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                      <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600"><MessageSquare className="w-6 h-6" /></div>
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">Interview Scorecard</h3>
                            <p className="text-xs text-slate-500 font-medium">Rate the candidate based on specific responses</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">
                            Avg. Rating ({ratedQs.length}/{interviewQuestions.length})
                          </span>
                          <span className="text-3xl font-black text-indigo-600">{avgRating}</span>
                        </div>
                      </div>

                      <div className="space-y-6">
                        {interviewQuestions.map((q) => (
                          <div key={q.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 group relative">
                            <button onClick={() => removeInterviewQuestion(q.id)}
                              className="absolute top-4 right-4 p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <div className="space-y-4">
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Question</label>
                                  {q.isGlobal && (
                                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 uppercase tracking-widest">
                                      Bank
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-bold text-slate-800">{q.question}</p>
                              </div>
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Candidate Answer</label>
                                <textarea value={q.answer} onChange={(e) => updateInterviewQuestion(q.id, { answer: e.target.value })}
                                  placeholder="Record candidate's response..."
                                  className="w-full p-4 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[100px] resize-none"
                                />
                              </div>
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Response Rating</label>
                                <div className="flex gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button key={star}
                                      onClick={() => updateInterviewQuestion(q.id, { rating: q.rating === star ? 0 : star })}
                                      className={cn("p-1 transition-all hover:scale-125 active:scale-90",
                                        q.rating >= star ? "text-amber-400" : "text-slate-200 hover:text-amber-200")}>
                                      <Star className={cn("w-6 h-6", q.rating >= star ? "fill-current" : "")} />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}

                        <div className="pt-4 border-t border-slate-100">
                          <div className="flex gap-3">
                            <input type="text" value={newQuestion}
                              onChange={(e) => setNewQuestion(e.target.value)}
                              onKeyPress={(e) => { if (e.key === "Enter") { addInterviewQuestion(newQuestion); setNewQuestion(""); } }}
                              placeholder="Add a custom interview question..."
                              className="flex-1 p-4 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                            <button onClick={() => { addInterviewQuestion(newQuestion); setNewQuestion(""); }}
                              className="p-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95">
                              <Plus className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </MotionDiv>
                )}

              </AnimatePresenceComp>
            </Suspense>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-slate-200 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3 opacity-50 grayscale hover:grayscale-0 transition-all cursor-default">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <span className="text-xs font-bold uppercase tracking-widest">TalentMatch AI Intelligence Engine</span>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            © 2026 TalentMatch AI • Enterprise Grade Candidate Intelligence
          </p>
        </div>
      </footer>
    </div>
    </>
    </Suspense>
  );
}
