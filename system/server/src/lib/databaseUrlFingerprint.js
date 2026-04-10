/**
 * معلومات غير حساسة عن DATABASE_URL (لتشخيص Vercel دون كشف كلمة المرور).
 */
export function databaseUrlFingerprint() {
  const raw = process.env.DATABASE_URL;
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return {
      databaseUrlSet: false,
      hint: "DATABASE_URL غير معرّف في بيئة التشغيل (تحقق من Vercel → Production + Redeploy).",
    };
  }

  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      databaseUrlSet: true,
      looksLikePostgresUri: false,
      protocol: trimmed.split(":")[0],
      hint:
        "القيمة تبدأ بـ http(s) — هذا ليس رابط PostgreSQL. استخدم Connection string من Supabase → Database → URI (postgresql://...).",
    };
  }

  try {
    const u = new URL(trimmed);
    const host = u.hostname || "";
    const pgbouncer =
      u.searchParams.get("pgbouncer") === "true" ||
      /pgbouncer=true/i.test(u.search);
    const sslmode = u.searchParams.get("sslmode") || "";
    const isSupabase =
      host.includes("supabase.co") || host.includes("supabase.com");
    let hint;
    if (!pgbouncer && host.includes("pooler")) {
      hint =
        "مضيف pooler: أضف ?pgbouncer=true (أو &pgbouncer=true) — راجع Prisma + Supabase.";
    } else if (isSupabase && !sslmode) {
      hint =
        "جرّب إلحاق &sslmode=require (أو ?sslmode=require) إن فشل الاتصال من Vercel.";
    }
    return {
      databaseUrlSet: true,
      looksLikePostgresUri: true,
      host,
      port: u.port || "(افتراضي)",
      database: (u.pathname || "").replace(/^\//, "") || "(غير محدد)",
      pgbouncerParam: pgbouncer,
      sslmode: sslmode || "(غير مضبوط)",
      hint,
    };
  } catch {
    return {
      databaseUrlSet: true,
      looksLikePostgresUri: false,
      hint:
        "تعذر تحليل الرابط. تأكد أنه يبدأ بـ postgresql:// أو postgres:// وأن الرموز الخاصة في كلمة المرور مُرمّزة (URL-encoded).",
    };
  }
}
