import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "يجب تسجيل الدخول" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.organizationId) {
      return res.status(401).json({ error: "انتهت الجلسة — سجّل الدخول مجدداً" });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "جلسة غير صالحة" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "غير مصرح" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "صلاحية غير كافية" });
    }
    next();
  };
}
