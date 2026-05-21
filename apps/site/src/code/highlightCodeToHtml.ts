import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import githubDark from "shiki/themes/github-dark.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter() {
  highlighterPromise ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    themes: [githubDark],
    langs: [typescript, tsx],
  });
  return highlighterPromise;
}

export async function highlightCodeToHtml(source: string, lang: string) {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(source, {
    lang,
    theme: "github-dark",
  });
}
