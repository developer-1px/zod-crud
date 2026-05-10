export function langFromFilename(filename: string): string {
  if (filename.endsWith(".tsx")) return "tsx";
  if (filename.endsWith(".ts")) return "ts";
  if (filename.endsWith(".jsx")) return "jsx";
  if (filename.endsWith(".js")) return "js";
  if (filename.endsWith(".json")) return "json";
  if (filename.endsWith(".md")) return "md";
  return "tsx";
}
