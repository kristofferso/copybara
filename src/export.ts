import { diffWords } from './diff'
import type { Change, CodebaseIntel, Page } from './types'

export type PageGroup = { page: Page; changes: Change[] }

/** Groups by page, keeping the order pages were first touched. `firstPath` is moved to the top. */
export const groupByPage = (changes: Change[], firstPath?: string): PageGroup[] => {
  const groups = new Map<string, PageGroup>()
  for (const change of changes) {
    const group = groups.get(change.page.path)
    if (group) {
      group.changes.push(change)
      group.page = change.page
    } else {
      groups.set(change.page.path, { page: change.page, changes: [change] })
    }
  }
  const list = [...groups.values()]
  const index = list.findIndex(g => g.page.path === firstPath)
  if (index > 0) list.unshift(...list.splice(index, 1))
  return list
}

export const describeElement = (change: Change) => {
  const { tag, context, label } = change.target
  const name = label && !change.edit ? `\`${tag}\` “${label}”` : `\`${tag}\``
  return context ? `${name} in ${context}` : name
}

const EXCERPT = 240

/** Notes on big containers would otherwise paste a whole section of text into the prompt. */
const excerpt = (text: string) => {
  const flat = text.replace(/\n+/g, ' / ')
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT).trimEnd()}…` : text
}

const fence = (text: string) => {
  const ticks = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map(t => t.length + 1)))
  return `${ticks}text\n${text}\n${ticks}`
}

const quote = (text: string) =>
  text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n')

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const summary = (changes: Change[]) => {
  const edits = changes.filter(c => c.edit).length
  const notes = changes.filter(c => c.comment?.trim()).length
  const pages = groupByPage(changes).length
  return [edits && plural(edits, 'text change'), notes && plural(notes, 'note')]
    .filter(Boolean)
    .join(' and ')
    .concat(` across ${plural(pages, 'page')}`)
}

const codebaseSection = (codebase?: CodebaseIntel) => {
  if (!codebase) return ''
  const lines: string[] = []
  if (codebase.framework) lines.push(`- Framework: ${codebase.framework}`)
  if (codebase.textSources?.length) {
    lines.push('- User-facing text is defined in:')
    codebase.textSources.forEach(source => lines.push(`  - \`${source}\``))
  }
  if (codebase.notes?.trim()) lines.push(`- ${codebase.notes.trim()}`)
  return lines.length ? `## About this codebase\n\n${lines.join('\n')}\n\n` : ''
}

const HOW_TO = `## How to apply

- For each change, find where the original text is defined: components, templates, translation (i18n) files, Markdown/MDX, CMS seed data or config. Search for the exact original text first. If that finds nothing, search for a distinctive fragment. Rendered text can be split across elements, assembled from variables, or differ from the source in whitespace and letter case (CSS \`text-transform\`).
- Change only the wording. Keep markup, styling, links, variables and interpolation placeholders intact unless a note asks for more.
- If the text is localized, update the locale given for the page. Point out other locales that probably need the same change instead of inventing translations.
- If the same text is used in several places, change the occurrence that belongs to the listed page unless it is clearly one shared string. Ask when it is ambiguous.
- Notes are requests from the reviewer about that element. A note can come without a text change.
- Do not guess. If you cannot find something, say so.
- Finish with a short summary: what you changed in which file, and anything you left unresolved.`

export type ExportOptions = {
  origin?: string
  instructions?: string
  codebase?: CodebaseIntel
}

export const toPrompt = (changes: Change[], options: ExportOptions = {}): string => {
  const where = options.origin ? ` at ${options.origin}` : ''
  let out = `# Copy changes\n\n`
  out += `Someone reviewed the text on the live website${where} and made the edits below with Copybara. Apply them to the source code. (${summary(changes)}.)\n\n`
  out += `${HOW_TO}\n\n`
  out += codebaseSection(options.codebase)
  if (options.instructions?.trim()) out += `## Project instructions\n\n${options.instructions.trim()}\n\n`
  out += `## Changes\n`

  let n = 0
  for (const { page, changes: pageChanges } of groupByPage(changes)) {
    const lang = page.lang ? `, lang \`${page.lang}\`` : ''
    out += `\n### ${page.title || 'Untitled page'} (\`${page.path}\`${lang})\n`
    for (const change of pageChanges) {
      const parts: string[] = []
      if (change.edit) {
        parts.push(`Original text:\n${fence(change.target.text)}`, `New text:\n${fence(change.edit.text)}`)
      } else if (change.target.text && !change.target.src) {
        const short = excerpt(change.target.text)
        parts.push(`${short === change.target.text ? 'Current text' : 'Text (excerpt)'}:\n${fence(short)}`)
      }
      if (change.target.src) parts.push(`Media: ${change.target.src}`)
      if (change.comment?.trim()) parts.push(`Note from reviewer:\n${quote(change.comment.trim())}`)
      out += `\n#### ${++n}. ${describeElement(change)}\n\n${parts.join('\n\n')}\n`
    }
  }
  return out.trimEnd() + '\n'
}

const escapeMarkdown = (text: string) => text.replace(/([\\`*_~[\]<>|])/g, '\\$1')

const inlineDiff = (before: string, after: string) =>
  diffWords(before, after)
    .map(({ type, value }, i, parts) => {
      if (type === 'same' || !value.trim()) return escapeMarkdown(value)
      const text = escapeMarkdown(value.trim())
      const lead = value.match(/^\s*/)![0]
      const trail = value.match(/\s*$/)![0]
      // A replacement is a deletion right next to an insertion; keep them apart.
      const prev = parts[i - 1]
      const gap = type === 'ins' && prev?.type === 'del' && !lead && !/\s$/.test(prev.value) ? ' ' : ''
      return gap + lead + (type === 'del' ? `~~${text}~~` : `**${text}**`) + trail
    })
    .join('')
    .replace(/\n/g, '  \n   ')

/** Human-readable changelog for issues, pull requests or chat. */
export const toMarkdown = (changes: Change[], options: ExportOptions = {}): string => {
  const where = options.origin ? ` on ${options.origin}` : ''
  let out = `## Copy changes${where}\n\n_${summary(changes)}_\n`
  for (const { page, changes: pageChanges } of groupByPage(changes)) {
    out += `\n### ${escapeMarkdown(page.title || 'Untitled page')} (\`${page.path}\`)\n\n`
    pageChanges.forEach((change, i) => {
      out += `${i + 1}. ${describeElement(change)}\n`
      if (change.edit) out += `   ${inlineDiff(change.target.text, change.edit.text)}\n`
      if (change.target.src) out += `   [Media](${change.target.src})\n`
      if (change.comment?.trim()) out += `   ${quote(change.comment.trim()).replace(/\n/g, '\n   ')}\n`
    })
  }
  return out.trimEnd() + '\n'
}
