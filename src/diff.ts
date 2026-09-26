export type DiffPart = { type: 'same' | 'del' | 'ins'; value: string }

const tokenize = (text: string) => text.match(/\s+|[^\s]+/g) ?? []

/** Word-level diff (longest common subsequence). Adjacent parts of the same type are merged. */
export const diffWords = (before: string, after: string): DiffPart[] => {
  const a = tokenize(before)
  const b = tokenize(after)
  const width = b.length + 1
  const lcs = new Uint32Array((a.length + 1) * width)

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!)
    }
  }

  const parts: DiffPart[] = []
  const push = (type: DiffPart['type'], value: string) => {
    const last = parts[parts.length - 1]
    if (last?.type === type) last.value += value
    else parts.push({ type, value })
  }

  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]!)
      i++
      j++
    } else if (lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!) {
      push('del', a[i++]!)
    } else {
      push('ins', b[j++]!)
    }
  }
  while (i < a.length) push('del', a[i++]!)
  while (j < b.length) push('ins', b[j++]!)

  return parts
}
