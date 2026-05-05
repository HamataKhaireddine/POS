import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { listSyncQueueRows } from "../offline/syncQueueList.js";
import { getLocalReadKeySet } from "../alerts/localRead.js";
import { useOffline } from "../context/OfflineContext.jsx";

/**
 * غير مقروء: تنبيهات الخادم + عناصر طابور المزامنة غير المعلّمة محلياً.
 */
export function useAlertsBadgeCount() {
  const { pendingCount } = useOffline();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    let server = 0;
    try {
      const r = await api("/api/notifications/unread-count");
      server = typeof r?.count === "number" ? r.count : 0;
    } catch {
      server = 0;
    }
    let local = 0;
    try {
      const rows = await listSyncQueueRows();
      const read = getLocalReadKeySet();
      for (const row of rows) {
        const k = `sync-local:${row.localId}`;
        if (!read.has(k)) local += 1;
      }
    } catch {
      local = 0;
    }
    setCount(server + local);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 45000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, pendingCount]);

  return { count, refresh: load };
}
