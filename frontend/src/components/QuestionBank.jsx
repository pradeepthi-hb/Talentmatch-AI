/**
 * components/QuestionBank.jsx
 *
 * Panel for managing reusable custom questions.
 * Each question has an "Apply to All" toggle — when on, the question is
 * automatically appended to every candidate's scorecard after analysis.
 */

import { useState } from "react";
import {
  BookOpen, Plus, Trash2, ToggleLeft, ToggleRight, Pencil, Check, X,
} from "lucide-react";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

const CATEGORIES = ["Custom", "Technical", "Behavioral", "Fitment", "Interest"];

function categoryColor(cat) {
  if (cat === "Technical")  return "bg-indigo-100 text-indigo-700";
  if (cat === "Behavioral") return "bg-amber-100 text-amber-700";
  if (cat === "Fitment")    return "bg-emerald-100 text-emerald-700";
  if (cat === "Interest")   return "bg-violet-100 text-violet-700";
  return "bg-slate-100 text-slate-500";
}

// Single editable question row
function QuestionRow({ q, onRemove, onToggle, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(q.text);
  const [draftCat, setDraftCat] = useState(q.category);

  const save = () => {
    if (draft.trim()) onUpdate(q.id, { text: draft.trim(), category: draftCat });
    setEditing(false);
  };

  const cancel = () => {
    setDraft(q.text);
    setDraftCat(q.category);
    setEditing(false);
  };

  return (
    <div className={cn(
      "rounded-xl border transition-all",
      q.apply
        ? "border-indigo-200 bg-indigo-50/40"
        : "border-slate-100 bg-slate-50/60"
    )}>
      {editing ? (
        <div className="p-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
            rows={2}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <select
              value={draftCat}
              onChange={(e) => setDraftCat(e.target.value)}
              className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <div className="flex gap-1.5 ml-auto">
              <button onClick={save}
                className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={cancel}
                className="p-1.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 flex items-start gap-2">
          {/* Apply toggle */}
          <button
            onClick={() => onToggle(q.id)}
            title={q.apply ? "Applied to all candidates — click to disable" : "Not applied — click to enable"}
            className="mt-0.5 shrink-0 transition-colors"
          >
            {q.apply
              ? <ToggleRight className="w-5 h-5 text-indigo-600" />
              : <ToggleLeft className="w-5 h-5 text-slate-300" />
            }
          </button>

          {/* Question text + category */}
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-xs leading-relaxed",
              q.apply ? "text-slate-700 font-medium" : "text-slate-400"
            )}>
              {q.text}
            </p>
            <span className={cn(
              "inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest",
              categoryColor(q.category)
            )}>
              {q.category}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-1 shrink-0">
            <button onClick={() => setEditing(true)}
              className="p-1 text-slate-300 hover:text-indigo-500 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onRemove(q.id)}
              className="p-1 text-slate-300 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Main panel
export default function QuestionBank({
  questionBank,
  onAdd,
  onRemove,
  onToggle,
  onUpdate,
}) {
  const [newText, setNewText] = useState("");
  const [newCat, setNewCat] = useState("Custom");
  const [open, setOpen] = useState(false); // collapsed by default to save space

  const activeCount = questionBank.filter((q) => q.apply).length;

  const handleAdd = () => {
    if (!newText.trim()) return;
    onAdd(newText, newCat);
    setNewText("");
    setNewCat("Custom");
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
      {/* Header — always visible, clicking toggles the panel */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between hover:bg-slate-50 transition-all"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-violet-100 rounded-md text-violet-600">
            <BookOpen className="w-4 h-4" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Question Bank
          </h2>
          {questionBank.length > 0 && (
            <div className="flex gap-1">
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {questionBank.length} saved
              </span>
              {activeCount > 0 && (
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                  {activeCount} active
                </span>
              )}
            </div>
          )}
        </div>
        {/* Chevron */}
        <svg
          className={cn("w-4 h-4 text-slate-400 transition-transform", open && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="p-3 space-y-3">
          {/* Helper text */}
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Questions with the{" "}
            <span className="inline-flex items-center gap-0.5 align-middle">
              <ToggleRight className="w-3.5 h-3.5 text-indigo-600" />
            </span>{" "}
            toggle <span className="font-bold text-slate-500">on</span> are automatically appended to every candidate&apos;s scorecard after analysis.
          </p>

          {/* Question list */}
          {questionBank.length === 0 ? (
            <p className="text-center py-3 text-[11px] text-slate-400 italic">
              No saved questions yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {questionBank.map((q) => (
                <QuestionRow
                  key={q.id}
                  q={q}
                  onRemove={onRemove}
                  onToggle={onToggle}
                  onUpdate={onUpdate}
                />
              ))}
            </div>
          )}

          {/* Add new */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(); } }}
              placeholder="Type a question and press Enter..."
              rows={2}
              className="w-full text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-slate-300"
            />
            <div className="flex gap-2">
              <select
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                className="flex-1 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <button
                onClick={handleAdd}
                disabled={!newText.trim()}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all",
                  newText.trim()
                    ? "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                )}
              >
                <Plus className="w-3.5 h-3.5" /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
