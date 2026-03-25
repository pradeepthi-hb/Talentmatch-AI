import { getToken } from "./authService.js";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function req(method, path, body, isFormData = false) {
  const token = getToken();
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (!isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: isFormData ? body : (body !== undefined ? JSON.stringify(body) : undefined),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// Analyses sidebar

export const listAnalyses  = (page = 1) => req("GET", `/api/analyses?page=${page}&limit=30`);

export const createAnalysis = (jobDescription = "", title) =>
  req("POST", "/api/analyses", { job_description: jobDescription, title });

export const fetchAnalysis  = (id) => req("GET", `/api/analyses/${id}`);

export const renameAnalysis = (id, title) => req("PATCH", `/api/analyses/${id}/title`, { title });

export const updateJd = (id, jobDescription) =>
  req("PUT", `/api/analyses/${id}/jd`, { job_description: jobDescription });

export const deleteAnalysis = (id) => req("DELETE", `/api/analyses/${id}`);

// Candidates

/**
 * Add a candidate — sends resume file + extracted text.
 * @param {number} analysisId
 * @param {File|null} resumeFile  
 * @param {string} resumeText  
 */
export const addCandidate = (analysisId, resumeFile, resumeText) => {
  const fd = new FormData();
  if (resumeFile) fd.append("resume", resumeFile);
  fd.append("resumeText", resumeText);
  fd.append("extractedText", resumeText);
  return req("POST", `/api/analyses/${analysisId}/candidates`, fd, true);
};

export const renameCandidate = (analysisId, candidateId, name) =>
  req("PATCH", `/api/analyses/${analysisId}/candidates/${candidateId}/name`, { name });

export const deleteCandidate = (analysisId, candidateId) =>
  req("DELETE", `/api/analyses/${analysisId}/candidates/${candidateId}`);

/**
 * Run (or re-run) analysis for one candidate.
 * @param {number} analysisId
 * @param {number} candidateId
 * @param {object[]} globalQuestions  
 */
export const analyzeOne = (analysisId, candidateId, globalQuestions = []) =>
  req("POST", `/api/analyses/${analysisId}/candidates/${candidateId}/analyze`,
    { globalQuestions: JSON.stringify(globalQuestions) });

// Interview questions

export const addQuestion = (analysisId, candidateId, question, category = "Custom", isGlobal = false) =>
  req("POST", `/api/analyses/${analysisId}/candidates/${candidateId}/questions`,
    { question, category, isGlobal });

export const updateQuestion = (analysisId, candidateId, questionId, updates) =>
  req("PUT", `/api/analyses/${analysisId}/candidates/${candidateId}/questions/${questionId}`, updates);

export const deleteQuestion = (analysisId, candidateId, questionId) =>
  req("DELETE", `/api/analyses/${analysisId}/candidates/${candidateId}/questions/${questionId}`);