import { useEffect, useState } from "react";
import {
  resolveImageUrlForDisplay,
  dataUrlToObjectUrl,
} from "../utils/imageUrl.js";

/**
 * رابط آمن لـ &lt;img src&gt;: أي data: يُحوَّل إلى blob: لأن Chrome يعطي net::ERR_INVALID_URL
 * لسلاسل base64 الطويلة كقيمة src مباشرة.
 */
export function useSafeImageSrc(rawUrl) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    const resolved = resolveImageUrlForDisplay(rawUrl);
    if (!resolved) {
      setSrc("");
      return undefined;
    }
    if (!resolved.startsWith("data:")) {
      setSrc(resolved);
      return undefined;
    }
    const u = dataUrlToObjectUrl(resolved);
    if (!u) {
      setSrc("");
      return undefined;
    }
    setSrc(u);
    return () => {
      if (u.startsWith("blob:")) URL.revokeObjectURL(u);
    };
  }, [rawUrl]);

  return src;
}
