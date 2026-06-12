// Toast 상태. error 는 클릭 시까지 유지 (zod 메시지가 길어서), info 는 2.5s.

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONDocumentError } from "@interactive-os/json-document";

export interface ToastMessage {
  id: number;
  level: "error" | "info";
  text: string;
}

let toastSeq = 0;

export function useToasts() {
  const [errors, setErrors] = useState<ToastMessage[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => {
    for (const timeout of timeoutsRef.current) clearTimeout(timeout);
    timeoutsRef.current = [];
  }, []);

  const pushToast = useCallback((level: "error" | "info", text: string) => {
    const id = ++toastSeq;
    setErrors((prev) => [...prev, { id, level, text }]);
    if (level === "info") {
      const timeout = setTimeout(() => {
        setErrors((prev) => prev.filter((m) => m.id !== id));
        timeoutsRef.current = timeoutsRef.current.filter((entry) => entry !== timeout);
      }, 2500);
      timeoutsRef.current.push(timeout);
    }
  }, []);

  const dismissToast = useCallback((id: number) => {
    setErrors((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const onError = useCallback((e: JSONDocumentError) => {
    pushToast("error", `${e.result.code}${e.result.reason ? `: ${e.result.reason}` : ""}`);
  }, [pushToast]);

  return { errors, pushToast, dismissToast, onError };
}
