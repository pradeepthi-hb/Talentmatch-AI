import { getToken } from "./authService";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3002";

/**
 * @param {string} jd
 * @param {string} resume
 * @returns {Promise<object>}
 */
export async function analyzeCandidate(jd, resume) {
  const token = getToken();
  
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jd, resume }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload.error ?? `Request failed with status ${response.status}`
    );
  }

  return response.json();
}