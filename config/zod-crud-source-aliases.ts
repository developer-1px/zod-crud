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
] as const;

export type OfficialExtensionPackage = (typeof officialExtensionPackages)[number];

export interface ZodCrudSourceAliasOptions {
  officialExtensions?: boolean | ReadonlyArray<OfficialExtensionPackage>;
  extra?: ReadonlyArray<SourceAlias>;
}

export function zodCrudSourceAliases(options: ZodCrudSourceAliasOptions = {}): SourceAlias[] {
  const extensionPackages = options.officialExtensions === true
    ? officialExtensionPackages
    : options.officialExtensions || [];

  return [
    ...extensionPackages.map(extensionPackageAlias),
    ...(options.extra ?? []),
    {
      find: "zod-crud/react",
      replacement: sourceFile("packages/zod-crud/src/react.ts"),
    },
    {
      find: "zod-crud",
      replacement: sourceFile("packages/zod-crud/src/index.ts"),
    },
  ];
}

export function labExtensionSourceAlias(name: string): SourceAlias {
  return {
    find: `@zod-crud/${name}`,
    replacement: sourceFile(`labs/extensions/${name}/src/index.ts`),
  };
}

function extensionPackageAlias(name: OfficialExtensionPackage): SourceAlias {
  return {
    find: `@zod-crud/${name}`,
    replacement: sourceFile(`packages/${name}/src/index.ts`),
  };
}

function sourceFile(path: string): string {
  return fileURLToPath(new URL(`../${path}`, import.meta.url));
}
