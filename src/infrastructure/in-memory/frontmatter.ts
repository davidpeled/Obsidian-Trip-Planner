/** Parses the flat `key: value` frontmatter this plugin writes (values are plain or JSON-quoted). */
export function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) return null;
  const result: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const at = line.indexOf(":");
    if (at < 0) continue;
    const raw = line.slice(at + 1).trim();
    result[line.slice(0, at).trim()] = raw.startsWith('"') ? (JSON.parse(raw) as string) : /^\d+$/.test(raw) ? Number(raw) : raw;
  }
  return result;
}
