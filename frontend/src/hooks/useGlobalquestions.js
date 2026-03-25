import { useState } from "react";

function makeId() {
  return Math.random().toString(36).substr(2, 9);
}

export function useGlobalQuestions() {
  const [questionBank, setQuestionBank] = useState([]);

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
    activeGlobalQuestions,
    addBankQuestion,
    removeBankQuestion,
    toggleApply,
    updateBankQuestion,
    toInterviewQuestions,
  };
}