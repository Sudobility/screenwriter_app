/** Word-level diff by longest common subsequence: small, no dependency. Whitespace and punctuation are tokens too. */
export type DiffOp = "same" | "del" | "add";
export interface DiffPart {
  op: DiffOp;
  text: string;
}

const tokenize = (s: string): string[] => s.match(/\s+|[\p{L}\p{N}'’_-]+|[^\s\p{L}\p{N}]/gu) ?? [];

export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  // Trim the common prefix and suffix so the table only covers the changed middle.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start;
  const m = endB - start;
  // lcs[i][j] = LCS length of a[start+i..] and b[start+j..]
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[start + i] === b[start + j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffPart[] = [];
  const push = (op: DiffOp, text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  for (let i = 0; i < start; i++) push("same", a[i]!);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      push("same", a[start + i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push("del", a[start + i++]!);
    } else {
      push("add", b[start + j++]!);
    }
  }
  while (i < n) push("del", a[start + i++]!);
  while (j < m) push("add", b[start + j++]!);
  for (let k = endA; k < a.length; k++) push("same", a[k]!);
  return out;
}
