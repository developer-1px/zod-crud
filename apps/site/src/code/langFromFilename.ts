export function langFromFilename(filename: string): string {
  if (filename.endsWith(".tsx")) return "tsx";
  return "ts";
}
