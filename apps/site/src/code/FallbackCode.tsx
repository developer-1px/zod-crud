export function FallbackCode({
  source,
  lineStart = 1,
  fitContent = false,
}: {
  source: string;
  lineStart?: number;
  fitContent?: boolean;
}) {
  const lines = source.split("\n");
  const className = fitContent
    ? "p-4 text-xs leading-relaxed text-stone-100 font-mono overflow-x-auto whitespace-pre break-normal"
    : "flex-1 p-4 text-xs leading-relaxed text-stone-100 font-mono md:overflow-auto whitespace-pre break-normal";

  return (
    <pre className={className}>
      <code>
        {lines.map((line, i) => (
          <span key={i} className="block">
            <span className="inline-block w-8 pr-3 text-right text-stone-600 select-none">
              {lineStart + i}
            </span>
            {line}
          </span>
        ))}
      </code>
    </pre>
  );
}
