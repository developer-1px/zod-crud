import { fileURLToPath } from "node:url";

export interface SourceAlias {
  find: string;
  replacement: string;
}

export const officialExtensionPackages = [
  "clipboard-web",
  "collection",
  "outline",
  "schema-form",
  "dirty-state",
  "bulk-edit",
  "patch-log",
  "persist-web",
  "id-resolver",
  "patch-preview",
  "search-replace",
  "proposed-changes",
  "comments",
  "form-draft",
  "protected-ranges",
  "snippets",
] as const;

export type OfficialExtensionPackage = (typeof officialExtensionPackages)[number];

export interface JsonDocumentSourceAliasOptions {
  officialExtensions?: boolean | ReadonlyArray<OfficialExtensionPackage>;
  extra?: ReadonlyArray<SourceAlias>;
}

export function jsonDocumentSourceAliases(options: JsonDocumentSourceAliasOptions = {}): SourceAlias[] {
  const extensionPackages = options.officialExtensions === true
    ? officialExtensionPackages
    : options.officialExtensions || [];

  return [
    ...extensionPackages.map(extensionPackageAlias),
    ...(options.extra ?? []),
    {
      find: "@interactive-os/json-document/react",
      replacement: sourceFile("packages/json-document/src/react.ts"),
    },
    {
      find: "@interactive-os/json-document",
      replacement: sourceFile("packages/json-document/src/index.ts"),
    },
  ];
}

export function labExtensionSourceAlias(name: string): SourceAlias {
  return {
    find: `@interactive-os/json-document-${name}`,
    replacement: sourceFile(`labs/extensions/${name}/src/index.ts`),
  };
}

function extensionPackageAlias(name: OfficialExtensionPackage): SourceAlias {
  return {
    find: `@interactive-os/json-document-${name}`,
    replacement: sourceFile(`packages/${name}/src/index.ts`),
  };
}

function sourceFile(path: string): string {
  return fileURLToPath(new URL(`../${path}`, import.meta.url));
}
