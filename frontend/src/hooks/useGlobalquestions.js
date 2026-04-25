import { useEffect, useState } from "react";

function makeId() {
  return Math.random().toString(36).substr(2, 9);
}

export function useGlobalQuestions(storageKey) {
  const [questionBank, setQuestionBank] = useState([]);
  const [questionBankReady, setQuestionBankReady] = useState(false);

  useEffect(() => {
    setQuestionBankReady(false);

    if (!storageKey) {
      setQuestionBank([]);
      setQuestionBankReady(true);
      return;
    }

    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      setQuestionBank([]);
      setQuestionBankReady(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      setQuestionBank(Array.isArray(parsed) ? parsed : []);
    } catch {
      setQuestionBank([]);
    }
    setQuestionBankReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(questionBank));
  }, [storageKey, questionBank]);

  const addBankQuestion = (text, category = "Custom") => {
    if (!text?.trim()) return;
    setQuestionBank((prev) => [
      ...prev,
      { id: makeId(), text: text.trim(), category, apply: true },
    ]);
  };

  const removeBankQuestion = (id) => {
    setQuestionBank((prev) => prev.filter((q) => q.id !== id));
  };

  const toggleApply = (id) => {
    setQuestionBank((prev) =>
      prev.map((q) => (q.id === id ? { ...q, apply: !q.apply } : q))
    );
  };

  const updateBankQuestion = (id, updates) => {
    setQuestionBank((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );
  };

  const activeGlobalQuestions = questionBank.filter((q) => q.apply);

  const toInterviewQuestions = () =>
    activeGlobalQuestions.map((q) => ({
      id: makeId(),
      question: `[${q.category}] ${q.text}`,
      answer: "",
      rating: 0,
      isGlobal: true,
    }));

  return {
    questionBank,
    questionBankReady,
    activeGlobalQuestions,
    addBankQuestion,
    removeBankQuestion,
    toggleApply,
    updateBankQuestion,
    toInterviewQuestions,
  };
}
