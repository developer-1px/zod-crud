// Toast 상태. error 는 클릭 시까지 유지 (zod 메시지가 길어서), info 는 2.5s.

import { useCallback, useState } from "react";
import type { JSONCrudError } from "zod-crud";

export interface ToastMessage {
  id: number;
  level: "error" | "info";
  text: string;
}

let toastSeq = 0;

export function useToasts() {
  const [errors, setErrors] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((level: "error" | "info", text: string) => {
    const id = ++toastSeq;
    setErrors((prev) => [...prev, { id, level, text }]);
    if (level === "info") {
      setTimeout(() => setErrors((prev) => prev.filter((m) => m.id !== id)), 2500);
    }
  }, []);

  const dismissToast = useCallback((id: number) => {
    setErrors((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const onError = useCallback((e: JSONCrudError) => {
    pushToast("error", `${e.result.code}${e.result.reason ? `: ${e.result.reason}` : ""}`);
  }, [pushToast]);

  return { errors, pushToast, dismissToast, onError };
}
