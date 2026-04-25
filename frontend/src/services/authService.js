const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3002";

// ── Token helpers (localStorage) ─────────────────────────────────────────────

export function getToken() {
  return localStorage.getItem("tm_token");
}

export function setToken(token) {
  localStorage.setItem("tm_token", token);
}

export function removeToken() {
  localStorage.removeItem("tm_token");
}

// ── Request helper ────────────────────────────────────────────────────────────

async function request(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ── Auth API calls ────────────────────────────────────────────────────────────

export async function register(name, email, password) {
  const data = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  setToken(data.token);
  return data;
}

export async function login(email, password) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function getMe() {
  return request("/api/auth/me");
}

export function logout() {
  removeToken();
}