import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Pencil, ChevronLeft, BarChart3, Loader2, FileText, AlertCircle } from "lucide-react";
import { listAnalyses, createAnalysis, renameAnalysis, deleteAnalysis } from "../services/analysisService.js";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatSessionMeta(analysis) {
  const parts = [];

  if (Number(analysis.candidate_count) > 0) {
    parts.push(`${analysis.candidate_count} candidate${analysis.candidate_count !== 1 ? "s" : ""}`);
  }

  if (Number(analysis.analyzed_count) > 0) {
    parts.push(`${analysis.analyzed_count} analyzed`);
  }

  if (Number(analysis.outdated_count) > 0) {
    parts.push(`${analysis.outdated_count} outdated`);
  }

  return parts.join(" · ");
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getGroupLabel(dateStr) {
  const itemDate = startOfDay(new Date(dateStr));
  const today = startOfDay(new Date());
  const diffDays = Math.round((today.getTime() - itemDate.getTime()) / 86400000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 Days";
  if (diffDays <= 30) return "Previous 30 Days";
  return "Older";
}

function groupAnalyses(analyses) {
  const groups = [];

  for (const analysis of analyses) {
    const label = getGroupLabel(analysis.updated_at || analysis.created_at);
    const existing = groups.find((group) => group.label === label);

    if (existing) {
      existing.items.push(analysis);
      continue;
    }

    groups.push({ label, items: [analysis] });
  }

  return groups;
}

export default function AnalysisSidebar({
  open,
  onClose,
  currentAnalysisId,
  onSelectAnalysis,
  onNewAnalysis,
}) {
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const renameRef = useRef(null);
  const groupedAnalyses = groupAnalyses(analyses);

  useEffect(() => {
    if (!open) return;
    loadList();
  }, [open]);

  useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus();
  }, [renamingId]);

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const data = await listAnalyses();
      setAnalyses(data.analyses || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleNew() {
    setCreating(true);
    try {
      const data = await createAnalysis();
      setAnalyses((prev) => [
        {
          id: data.analysis.id,
          title: data.analysis.title,
          updated_at: data.analysis.updated_at,
          created_at: data.analysis.created_at,
          candidate_count: 0,
          analyzed_count: 0,
          outdated_count: 0,
        },
        ...prev,
      ]);
      onNewAnalysis(data.analysis);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  function startRename(analysis) {
    setRenamingId(analysis.id);
    setRenameValue(analysis.title);
  }

  async function commitRename(id) {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }

    try {
      await renameAnalysis(id, renameValue.trim());
      setAnalyses((prev) =>
        prev.map((analysis) =>
          analysis.id === id ? { ...analysis, title: renameValue.trim() } : analysis
        )
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setRenamingId(null);
    }
  }

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await deleteAnalysis(id);
      setAnalyses((prev) => prev.filter((analysis) => analysis.id !== id));
      if (currentAnalysisId === id) onNewAnalysis(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-40 flex flex-col",
          "bg-slate-900 text-white transition-all duration-300 ease-in-out",
          open ? "w-72 shadow-2xl" : "w-0 overflow-hidden"
        )}
      >
        {open && (
          <>
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700/60">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-bold tracking-tight">TalentMatch AI</span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                title="Close sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="px-3 pt-3 pb-2">
              <button
                onClick={handleNew}
                disabled={creating}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                New Analysis
              </button>
            </div>

            <div className="px-4 pb-2">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Saved analyses live here like previous chat sessions, so you can reopen any hiring review and continue from where you left off.
              </p>
            </div>

            {error && (
              <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 bg-red-900/40 border border-red-700/50 rounded-xl text-xs text-red-300">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-2 pb-4 mt-1">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                </div>
              ) : analyses.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <FileText className="w-8 h-8 text-slate-600 mb-2" />
                  <p className="text-xs text-slate-500">No analyses yet.</p>
                  <p className="text-xs text-slate-600 mt-0.5">Click New Analysis to start.</p>
                </div>
              ) : (
                groupedAnalyses.map((group) => (
                  <div key={group.label} className="pt-3 first:pt-0">
                    <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map((analysis) => (
                        <div
                          key={analysis.id}
                          onClick={() => renamingId !== analysis.id && onSelectAnalysis(analysis.id)}
                          className={cn(
                            "group relative flex items-start gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all",
                            currentAnalysisId === analysis.id
                              ? "bg-indigo-600/30 border border-indigo-500/40"
                              : "hover:bg-slate-700/60 border border-transparent"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            {renamingId === analysis.id ? (
                              <input
                                ref={renameRef}
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitRename(analysis.id);
                                  if (e.key === "Escape") setRenamingId(null);
                                }}
                                onBlur={() => commitRename(analysis.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full bg-slate-700 border border-indigo-400 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              />
                            ) : (
                              <>
                                <p className="text-sm font-medium text-slate-100 truncate leading-snug">
                                  {analysis.title}
                                </p>
                                <div className="mt-0.5 space-y-1">
                                  <span className="block text-[10px] text-slate-500">{timeAgo(analysis.updated_at)}</span>
                                  {formatSessionMeta(analysis) && (
                                    <span className="block text-[10px] text-slate-400 truncate">
                                      {formatSessionMeta(analysis)}
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>

                          {renamingId !== analysis.id && (
                            <div
                              className={cn(
                                "flex gap-0.5 shrink-0 transition-opacity",
                                currentAnalysisId === analysis.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              )}
                            >
                              <button
                                onClick={(e) => { e.stopPropagation(); startRename(analysis); }}
                                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-600 transition-all"
                                title="Rename"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(analysis.id); }}
                                disabled={deletingId === analysis.id}
                                className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-600 transition-all"
                                title="Delete"
                              >
                                {deletingId === analysis.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />
                                }
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
