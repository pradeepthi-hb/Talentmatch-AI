import { getToken } from "./authService.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3002";

/**
 * Calls POST /api/report.
 *
 * @param {object}   result             
 * @param {object[]} interviewQuestions
 * @param {File}     resumeFile         
 * @param {string}   candidateName      
 * @param {string}   jobTitle           
 */
export async function downloadReport(
  result,
  interviewQuestions = [],
  resumeFile,
  candidateName = "",
  jobTitle = ""
) {
  const token = getToken();

  const formData = new FormData();
  formData.append("resume", resumeFile);
  formData.append("result", JSON.stringify(result));
  formData.append("interviewQuestions", JSON.stringify(interviewQuestions));
  formData.append("candidateName", candidateName);
  formData.append("jobTitle", jobTitle);

  const response = await fetch(`${API_BASE}/api/report`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Report generation failed (${response.status})`);
  }

  const blob = await response.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  const safe = candidateName
    ? candidateName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_")
    : "Candidate";
  a.download = `${safe}_Report.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadComparisonReport(candidates, jobTitle = "") {
  const token = getToken();

  const payload = {
    candidates: candidates
      .filter((c) => c.result)
      .map((c) => ({ name: c.name, result: c.result })),
    jobTitle,
  };
 
  const response = await fetch(`${API_BASE}/api/comparison`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
 
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ?? `Comparison report failed (${response.status})`);
  }
 
  const blob = await response.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "Candidate_Comparison.pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}