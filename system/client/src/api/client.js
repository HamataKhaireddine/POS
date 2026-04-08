const BASE = import.meta.env.VITE_API_URL || "";

export function getToken() {
  return localStorage.getItem("token");
}

export async function api(path, options = {}) {
  const headers = { ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || "طلب فاشل");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
