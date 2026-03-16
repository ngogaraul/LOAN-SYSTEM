function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function getTokenExpiry(token) {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp);
  return Number.isFinite(exp) ? exp * 1000 : null;
}

export function isTokenExpired(token) {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;
  return Date.now() >= expiry;
}

export function saveAuth({ token, role, user_id }) {
  localStorage.setItem("token", token);
  localStorage.setItem("role", role);
  localStorage.setItem("user_id", String(user_id));
}

export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("user_id");
}

export function isAuthed() {
  const token = localStorage.getItem("token");
  if (!token) return false;
  if (isTokenExpired(token)) {
    clearAuth();
    return false;
  }
  return true;
}

export function getRole() {
  return localStorage.getItem("role") || "";
}

export function getAuth() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const user_id = localStorage.getItem("user_id");

  if (!token || isTokenExpired(token)) {
    clearAuth();
    return null;
  }

  return {
    token,
    role,
    user_id: user_id ? Number(user_id) : null,
  };
}
