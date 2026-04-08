import "../server/src/loadEnv.js";
import app from "../server/src/app.js";

/** يضمن أن المسارات تبدأ بـ /api كما في خادم Express المحلي */
function ensureApiPrefix(req) {
  const fix = (u) => {
    if (!u || typeof u !== "string") return u;
    if (u.startsWith("/api")) return u;
    if (u === "/" || u === "") return "/api/";
    return "/api" + (u.startsWith("/") ? u : "/" + u);
  };
  if (req.url) req.url = fix(req.url);
  if (req.originalUrl) req.originalUrl = fix(req.originalUrl);
}

export default function handler(req, res) {
  ensureApiPrefix(req);
  return app(req, res);
}
