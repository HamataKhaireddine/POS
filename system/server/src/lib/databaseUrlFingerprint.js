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
    return {
      databaseUrlSet: true,
      looksLikePostgresUri: true,
      host,
      port: u.port || "(افتراضي)",
      database: (u.pathname || "").replace(/^\//, "") || "(غير محدد)",
      pgbouncerParam: pgbouncer,
      hint: !pgbouncer && host.includes("pooler")
        ? "أنت تستخدم مضيف pooler؛ غالباً تحتاج ?pgbouncer=true في نهاية الرابط (راجع وثائق Prisma + Supabase)."
        : undefined,
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
