import { parse } from "@babel/parser";
import type { Statement } from "@babel/types";

export function computeHighlightSet(source: string, symbols: string[]): Set<number> {
  const out = new Set<number>();
  if (symbols.length === 0) return out;

  let ast;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch {
    return out;
  }

  const wanted = new Set(symbols);
  for (const node of ast.program.body as Statement[]) {
    if (node.type !== "ExportNamedDeclaration" && node.type !== "ExportDefaultDeclaration") continue;
    if (!node.loc) continue;

    let matches = false;
    if (node.type === "ExportNamedDeclaration") {
      matches = exportDeclarationMatches(node, wanted);
    }

    if (matches) {
      for (let i = node.loc.start.line - 1; i <= node.loc.end.line - 1; i++) out.add(i);
    }
  }

  return out;
}

function exportDeclarationMatches(
  node: Extract<Statement, { type: "ExportNamedDeclaration" }>,
  wanted: Set<string>,
): boolean {
  const declaration = node.declaration;

  if (declaration) {
    if ("id" in declaration && declaration.id?.type === "Identifier" && wanted.has(declaration.id.name)) return true;
    if (declaration.type === "VariableDeclaration") {
      for (const value of declaration.declarations) {
        if (value.id.type === "Identifier" && wanted.has(value.id.name)) return true;
      }
    }
  }

  return node.specifiers.some((specifier) => {
    if (specifier.type !== "ExportSpecifier") return false;
    const exportedName = specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value;
    return wanted.has(exportedName);
  });
}
