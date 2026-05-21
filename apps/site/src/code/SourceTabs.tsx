import { useState } from "react";
import { CopyButton } from "./CopyButton";
import { HighlightedCode } from "./HighlightedCode";

export type SourceTab = {
  key: string;
  label: string;
  filename: string;
  source: string;
  lineStart?: number;
  lineEnd?: number;
};

/**
 * 코드 SSOT 뷰어 — 파일을 탭으로 묶어 원본을 그대로 보여준다.
 * 각 탭은 실제 소스(?raw 임포트)를 받아 shiki 로 하이라이트한다.
 */
export function SourceTabs({
  tabs,
  filenamePrefix,
  initialKey,
  fitContent = false,
}: {
  tabs: SourceTab[];
  filenamePrefix?: string;
  initialKey?: string;
  fitContent?: boolean;
}) {
  const [activeKey, setActiveKey] = useState<string>(initialKey ?? tabs[0]?.key ?? "");
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  if (!active) return null;
  const activeLocation = formatLocation(active);
  const frameClassName = fitContent
    ? "flex flex-col bg-stone-900 rounded-md border border-stone-800 overflow-hidden"
    : "flex h-full min-h-0 flex-col bg-stone-900 rounded-md border border-stone-800 overflow-hidden";
  const panelClassName = fitContent
    ? "flex flex-col"
    : "flex flex-1 min-h-0 flex-col md:overflow-hidden";

  return (
    <div className={frameClassName}>
      <div className="flex items-center justify-between border-b border-stone-800 px-4 py-2">
        <div role="tablist" aria-label="Source tabs" className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const selected = tab.key === active.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveKey(tab.key)}
                className="rounded px-2 py-0.5 text-[11px] font-mono text-stone-400 hover:text-stone-200 aria-selected:bg-stone-800 aria-selected:text-stone-100"
              >
                {tab.label}
              </button>
            );
          })}
          <code className="ml-2 whitespace-nowrap text-xs font-mono text-stone-500">
            {(filenamePrefix ?? "") + activeLocation}
          </code>
        </div>
        <CopyButton text={active.source} />
      </div>
      <div role="tabpanel" className={panelClassName}>
        <HighlightedCode
          source={active.source}
          filename={active.filename}
          lineStart={active.lineStart}
          fitContent={fitContent}
        />
      </div>
    </div>
  );
}

function formatLocation(tab: SourceTab): string {
  const filename = tab.filename;
  if (!tab.lineStart) return filename;
  if (!tab.lineEnd || tab.lineEnd === tab.lineStart) return `${filename}:${tab.lineStart}`;
  return `${filename}:${tab.lineStart}-${tab.lineEnd}`;
}
