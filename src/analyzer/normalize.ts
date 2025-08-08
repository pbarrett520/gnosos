export function normalizeText(input: string): string {
  let s = input.toLowerCase();
  // strip zero-width characters
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  // collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
