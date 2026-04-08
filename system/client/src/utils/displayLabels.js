/** احتياط إن كان الجلسة قديماً ولم تُحمَّل حقول nameEn بعد */
const USER_EN_FALLBACK = {
  "مدير النظام": "System administrator",
  كاشير: "Cashier",
};
export const BRANCH_EN_FALLBACK = {
  "الفرع الرئيسي": "Main branch",
  "فرع الشمال": "North branch",
};

/** اسم الفرع للعرض حسب اللغة (قوائم POS وغيرها) */
export function branchDisplayName(branch, locale) {
  if (!branch) return "";
  if (locale === "en") {
    if (branch.nameEn?.trim()) return branch.nameEn.trim();
    const ar = branch.name || "";
    if (BRANCH_EN_FALLBACK[ar]) return BRANCH_EN_FALLBACK[ar];
  }
  return branch.name || "";
}

/**
 * سطر المستخدم والفرع في الشريط — يعتمد على name/nameEn من الـ API
 */
export function formatUserBranchLine(user, locale, allBranchesLabel) {
  if (!user) return "";
  const en = locale === "en";
  let userName = user.name || "";
  if (en) {
    if (user.nameEn?.trim()) userName = user.nameEn.trim();
    else if (USER_EN_FALLBACK[user.name]) userName = USER_EN_FALLBACK[user.name];
  }
  if (!user.branchId) {
    return `${userName} — ${allBranchesLabel}`;
  }
  let branch = user.branchName || "";
  if (en) {
    if (user.branchNameEn?.trim()) branch = user.branchNameEn.trim();
    else if (user.branchName && BRANCH_EN_FALLBACK[user.branchName]) branch = BRANCH_EN_FALLBACK[user.branchName];
  }
  return `${userName} — ${branch}`;
}
