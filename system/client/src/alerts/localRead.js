const LS_KEY = "alertsReadLocalKeys_v1";

/** مفاتيح قراءة محلية (مثلاً طابور المزامنة) */
export function getLocalReadKeySet() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function addLocalReadKeys(keys) {
  const s = getLocalReadKeySet();
  for (const k of keys) s.add(k);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}
