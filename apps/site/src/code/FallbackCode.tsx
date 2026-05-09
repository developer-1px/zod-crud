export function FallbackCode({ source }: { source: string }) {
  const lines = source.split("\n");

  return (
    <pre className="flex-1 p-4 text-xs leading-relaxed text-stone-100 font-mono md:overflow-auto whitespace-pre break-normal">
      <code>
        {lines.map((line, i) => (
          <span key={i} className="block">
            <span className="inline-block w-8 pr-3 text-right text-stone-600 select-none">{i + 1}</span>
            {line}
          </span>
        ))}
      </code>
    </pre>
  );
}
