/**
 * Returns the candidate name extracted from resume text.
 *
 * @param {string} resumeText
 * @param {string} [fallback="Candidate"]
 * @returns {string}
 */
export function extractCandidateName(resumeText, fallback = "Candidate") {
  if (!resumeText?.trim()) return fallback;

  const lines = resumeText.split("\n");

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (
      t.includes("@") ||          
      /\+?\d[\d\s\-().]{6,}/.test(t) || 
      t.startsWith("http") ||   
      t.includes("linkedin") ||
      t.includes("github") ||
      t.length > 60              
    ) continue;

    const name = t
      .split("|")[0]
      .split(",")[0]
      .replace(/\s{2,}/g, " ")
      .trim();

    if (name.length >= 2 && name.length <= 50) {
      return name;
    }
  }

  return fallback;
}