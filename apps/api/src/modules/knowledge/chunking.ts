/** Chunk text by meaning: accumulate sentences up to a soft character budget. */
export function chunkText(text: string, opts: { maxChars?: number } = {}): string[] {
  const maxChars = opts.maxChars ?? 500;
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + 1 + s.length > maxChars) {
      chunks.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
