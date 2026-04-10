import { db, SYNC_TYPES } from "./db.js";
import { api } from "../api/client.js";

const MAX_RETRY = 8;

/**
 * @param {import('./db.js').SyncQueueType} type
 * @param {string} clientMutationId
 * @param {Record<string, unknown>} payload جسم الطلب للـ API (مثلاً checkout)
 */
export async function enqueue(type, clientMutationId, payload) {
  if (!clientMutationId) throw new Error("clientMutationId مطلوب");
  const existing = await db.syncQueue.where("clientMutationId").equals(clientMutationId).first();
  if (existing) return existing.localId;
  return db.syncQueue.add({
    type,
    clientMutationId,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
    lastError: null,
  });
}

export async function getPendingQueueCount() {
  return db.syncQueue.count();
}

/**
 * طابور تعديل مخزون (جرد يدوي / تصحيح) — يُرسل إلى POST /api/inventory/offline-upsert
 * @param {string} clientMutationId
 * @param {{ productId: string, branchId: string, quantity?: number, minStockLevel?: number, deviceId?: string }} fields
 */
export async function enqueueStockPatch(clientMutationId, fields) {
  return enqueue(SYNC_TYPES.STOCK_UPDATE, clientMutationId, {
    ...fields,
    clientMutationId,
  });
}

/**
 * يعالج الطابور بالتسلسل — يُستدعى عند عودة الاتصال أو يدوياً.
 * @returns {number} عدد العناصر المُعالجة بنجاح
 */
export async function processSyncQueue() {
  const rows = await db.syncQueue.orderBy("createdAt").toArray();
  let ok = 0;
  for (const row of rows) {
    try {
      const body = { ...row.payload, clientMutationId: row.clientMutationId };
      if (row.type === SYNC_TYPES.SALE) {
        await api("/api/sales/checkout", { method: "POST", body });
      } else if (row.type === SYNC_TYPES.REFUND) {
        await api("/api/refunds", { method: "POST", body });
      } else if (row.type === SYNC_TYPES.STOCK_UPDATE) {
        await api("/api/inventory/offline-upsert", { method: "POST", body });
      } else {
        console.warn("[sync] نوع غير معروف:", row.type);
        await db.syncQueue.delete(row.localId);
        continue;
      }
      await db.syncQueue.delete(row.localId);
      ok += 1;
    } catch (e) {
      const status = e && typeof e === "object" && "status" in e ? e.status : undefined;
      if (status === 401) {
        console.warn("[sync] جلسة منتهية — أوقف المزامنة حتى إعادة الدخول");
        break;
      }
      const msg = e instanceof Error ? e.message : String(e);
      const nextRetry = (row.retryCount ?? 0) + 1;
      if (nextRetry >= MAX_RETRY) {
        await db.syncQueue.delete(row.localId);
        console.error("[sync] أُهملت مهمة بعد المحاولات:", row.clientMutationId, msg);
      } else {
        await db.syncQueue.update(row.localId, {
          retryCount: nextRetry,
          lastError: msg,
        });
      }
    }
  }
  return ok;
}
