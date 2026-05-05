/**
 * جزء النقد من فاتورة (لحساب المتوقع في جلسة الصندوق).
 * @param {{ paymentMethod: string; total: unknown; amountPaid?: unknown; paymentSplits?: unknown }} sale
 */
export function cashPortionFromSale(sale) {
  const method = String(sale.paymentMethod || "");
  let splits = sale.paymentSplits;
  if (splits != null && typeof splits === "string") {
    try {
      splits = JSON.parse(splits);
    } catch {
      splits = null;
    }
  }
  if (method === "SPLIT" && Array.isArray(splits)) {
    let sum = 0;
    for (const row of splits) {
      if (String(row?.method || "").toUpperCase() === "CASH") {
        sum += Number(row.amount);
      }
    }
    return Number.isFinite(sum) ? sum : 0;
  }
  if (method === "CASH") {
    const paid = sale.amountPaid;
    if (paid != null) {
      const p =
        typeof paid === "object" && paid !== null && "toString" in paid
          ? Number(paid.toString())
          : Number(paid);
      if (Number.isFinite(p) && p >= 0) return p;
    }
    const t = sale.total;
    const n =
      t != null && typeof t === "object" && "toString" in t ? Number(t.toString()) : Number(t);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
