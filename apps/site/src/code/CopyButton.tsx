import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="rounded px-2 py-0.5 text-[11px] font-mono text-stone-400 hover:text-stone-100"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}
