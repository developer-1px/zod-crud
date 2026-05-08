import { Link, useRouter } from "@tanstack/react-router";
import { collectPalette, paletteCategory } from "../nav/palette";

export function Landing() {
  const router = useRouter();
  const entries = collectPalette(router).filter((e) => e.to !== "/");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 p-8">
      <header className="flex flex-col gap-3">
        <div className="text-xs font-medium uppercase tracking-wider text-stone-400">zod-crud</div>
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
          Flat JSON CRUD guarded by Zod
        </h1>
        <p className="text-base text-neutral-600">
          Parse JSON once, edit it as a flat node table, and commit only the mutations that
          keep the document valid under your root <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-sm">z.object</code>.
          CRUD · clipboard · undo / redo — all schema-checked, all rejected on the slightest drift.
        </p>
      </header>

      <section aria-labelledby="quick" className="flex flex-col gap-3">
        <h2 id="quick" className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Where to next
        </h2>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
          {entries.map((a) => (
            <li key={a.id}>
              <Link
                to={a.to as never}
                params={a.params as never}
                className="block rounded border border-neutral-200 bg-white p-4 hover:border-neutral-900 hover:shadow-sm"
              >
                <div className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                  {paletteCategory(a)}
                </div>
                <div className="mt-1 text-sm font-medium text-neutral-900">{a.label}</div>
                {a.sub && <div className="mt-1 text-xs text-neutral-500">{a.sub}</div>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="invariants" className="flex flex-col gap-3">
        <h2 id="invariants" className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Core invariants
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-neutral-700">
          <li>· Every committed document deserializes back through your root schema.</li>
          <li>· Parsed output must equal the stored JSON byte-for-byte. Drift = reject.</li>
          <li>· Failed mutations leave document, undo / redo stacks, clipboard, and id allocator untouched.</li>
          <li>· Successful mutations push exactly one undo snapshot and clear redo.</li>
        </ul>
      </section>
    </main>
  );
}
