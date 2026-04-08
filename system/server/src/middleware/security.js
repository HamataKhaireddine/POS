import helmet from "helmet";
import rateLimit from "express-rate-limit";

export const helmetMiddleware = helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات تسجيل دخول كثيرة. انتظر قليلاً ثم أعد المحاولة." },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز حد الطلبات. حاول بعد لحظات." },
});
