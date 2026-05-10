import { useEffect, useRef, useState } from "react";
import { codeToHtml } from "shiki";

import { computeHighlightSet } from "./computeHighlightSet.js";
import { FallbackCode } from "./FallbackCode.js";
import { langFromFilename } from "./langFromFilename.js";

export function HighlightedCode({
  source,
  filename,
  lineStart = 1,
  fitContent = false,
  highlightSymbols,
}: {
  source: string;
  filename: string;
  lineStart?: number;
  fitContent?: boolean;
  highlightSymbols?: string[];
}) {
  const [html, setHtml] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void codeToHtml(source, { lang: langFromFilename(filename), theme: "github-dark" })
      .then((h) => { if (!cancelled) setHtml(h); })
      .catch(() => { if (!cancelled) setHtml(null); });
    return () => { cancelled = true; };
  }, [source, filename]);

  useEffect(() => {
    if (!html || !ref.current) return;
    const lineEls = ref.current.querySelectorAll<HTMLElement>(".line");
    if (!highlightSymbols || highlightSymbols.length === 0) {
      lineEls.forEach((el) => el.classList.remove("opacity-30"));
      return;
    }
    const set = computeHighlightSet(source, highlightSymbols);
    lineEls.forEach((el, i) => {
      if (set.has(i)) el.classList.remove("opacity-30");
      else el.classList.add("opacity-30");
    });
  }, [html, highlightSymbols, source]);

  if (html) {
    const className = fitContent
      ? "text-xs leading-relaxed font-mono overflow-x-auto [&_pre]:!bg-transparent [&_pre]:py-4 [&_pre]:pl-2 [&_pre]:pr-4 [&_pre]:whitespace-pre [&_pre]:break-normal [counter-reset:lineno] [&_.line]:before:content-[counter(lineno)] [&_.line]:before:[counter-increment:lineno] [&_.line]:before:inline-block [&_.line]:before:w-8 [&_.line]:before:pr-3 [&_.line]:before:text-right [&_.line]:before:text-stone-600 [&_.line]:before:select-none"
      : "flex-1 text-xs leading-relaxed font-mono md:overflow-auto [&_pre]:!bg-transparent [&_pre]:py-4 [&_pre]:pl-2 [&_pre]:pr-4 [&_pre]:h-full [&_pre]:whitespace-pre [&_pre]:break-normal [counter-reset:lineno] [&_.line]:before:content-[counter(lineno)] [&_.line]:before:[counter-increment:lineno] [&_.line]:before:inline-block [&_.line]:before:w-8 [&_.line]:before:pr-3 [&_.line]:before:text-right [&_.line]:before:text-stone-600 [&_.line]:before:select-none";

    return (
      <div
        ref={ref}
        className={className}
        style={{ counterReset: `lineno ${lineStart - 1}` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return <FallbackCode source={source} lineStart={lineStart} fitContent={fitContent} />;
}
