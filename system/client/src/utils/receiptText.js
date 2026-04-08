import { productDisplayName } from "./productName.js";

const PAY_AR = { CASH: "نقدي", CARD: "بطاقة", ONLINE: "أونلاين", SPLIT: "تقسيم" };
const PAY_EN = { CASH: "Cash", CARD: "Card", ONLINE: "Online", SPLIT: "Split" };

function payLabel(method, locale) {
  const m = String(method || "").toUpperCase();
  return locale === "en" ? PAY_EN[m] || m : PAY_AR[m] || m;
}

/**
 * نص فاتورة بسيط للطابعة النصية أو الحافظة
 */
export function buildReceiptPlainText(sale, branchName, locale) {
  if (!sale) return "";
  const loc = locale === "en" ? "en-US" : "ar-SA";
  const cur = locale === "en" ? "SAR" : "ر.س";
  const lines = [];
  lines.push(locale === "en" ? "SALES INVOICE" : "فاتورة بيع");
  lines.push("---");
  lines.push(`${locale === "en" ? "Branch" : "الفرع"}: ${branchName || sale.branch?.name || "—"}`);
  lines.push(`${locale === "en" ? "Date" : "التاريخ"}: ${new Date(sale.createdAt).toLocaleString(loc)}`);
  lines.push(`${locale === "en" ? "Invoice #" : "رقم الفاتورة"}: ${sale.id}`);
  lines.push(`${locale === "en" ? "Cashier" : "الكاشير"}: ${sale.user?.name || "—"}`);
  if (sale.paymentMethod === "SPLIT" && Array.isArray(sale.paymentSplits)) {
    lines.push(`${locale === "en" ? "Payment" : "الدفع"}:`);
    for (const row of sale.paymentSplits) {
      lines.push(
        `  ${payLabel(row.method, locale)}: ${Number(row.amount).toFixed(2)} ${cur}`
      );
    }
  } else {
    lines.push(
      `${locale === "en" ? "Payment" : "الدفع"}: ${payLabel(sale.paymentMethod, locale)}`
    );
  }
  if (sale.customer) {
    lines.push(
      `${locale === "en" ? "Customer" : "العميل"}: ${sale.customer.name}${sale.customer.phone ? ` — ${sale.customer.phone}` : ""}`
    );
  }
  lines.push("---");
  for (const it of sale.items || []) {
    const nm = productDisplayName(it.product, locale);
    lines.push(`${nm} ×${it.quantity} = ${Number(it.subtotal).toFixed(2)} ${cur}`);
  }
  lines.push("---");
  const sub = sale.items?.reduce((s, it) => s + Number(it.subtotal), 0) ?? Number(sale.total);
  lines.push(`${locale === "en" ? "Subtotal" : "المجموع"}: ${sub.toFixed(2)} ${cur}`);
  const disc = Number(sale.discountAmount ?? 0);
  if (disc > 0) lines.push(`${locale === "en" ? "Discount" : "الخصم"}: -${disc.toFixed(2)} ${cur}`);
  const tax = Number(sale.taxAmount ?? 0);
  if (tax > 0) lines.push(`${locale === "en" ? "Tax" : "الضريبة"}: ${tax.toFixed(2)} ${cur}`);
  lines.push(`${locale === "en" ? "TOTAL" : "الإجمالي"}: ${Number(sale.total).toFixed(2)} ${cur}`);
  return lines.join("\n");
}
