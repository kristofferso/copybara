import type { Target } from './types.js'

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'COPYBARA-UI'])
const BLOCK = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FOOTER',
  'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P',
  'PRE', 'SECTION', 'TABLE', 'TR', 'UL',
])
const MEDIA = new Set(['IMG', 'VIDEO', 'PICTURE', 'CANVAS', 'IFRAME'])
const LANDMARKS = 'section, article, header, footer, nav, aside, main, form, dialog, [role="region"]'
const HEADINGS = 'h1, h2, h3, h4, [role="heading"]'

/**
 * Text as a reader sees it, without CSS `text-transform` (unlike innerText) so it matches the
 * source. Source whitespace collapses; <br> and block boundaries become line breaks.
 */
export const readText = (el: Element): string => {
  let out = ''
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += (child as Text).data.replace(/\s+/g, ' ')
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as Element).tagName.toUpperCase()
        if (SKIP.has(tag)) continue
        if (tag === 'BR') {
          out += '\n'
          continue
        }
        const block = BLOCK.has(tag)
        if (block) out += '\n'
        walk(child)
        if (block) out += '\n'
      }
    }
  }
  walk(el)
  return out
    .split('\n')
    .map(line => line.replace(/ +/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const hasOwnText = (el: Element) =>
  Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())

export const isMedia = (el: Element) => MEDIA.has(el.tagName.toUpperCase())

const mediaSrc = (el: Element): string | undefined => {
  if (el instanceof HTMLImageElement) return el.src || el.currentSrc || undefined
  if (el instanceof HTMLVideoElement) return el.currentSrc || el.src || el.poster || undefined
  if (el instanceof HTMLIFrameElement) return el.src || undefined
  const img = el.querySelector('img')
  return img ? mediaSrc(img) : undefined
}

// Generated ids (React useId, CSS-in-JS hashes, numbered ids) change between builds.
const isStableId = (id: string) => !/^[:«_]|[:»]$|\d{3,}|^[a-z]{1,3}-[a-z0-9]{5,}$/i.test(id)

export const selectorFor = (el: Element): string => {
  const parts: string[] = []
  let node: Element | null = el
  while (node && node !== document.documentElement) {
    if (node.id && isStableId(node.id)) {
      const id = `#${CSS.escape(node.id)}`
      if (document.querySelectorAll(id).length === 1) {
        parts.unshift(id)
        break
      }
    }
    const tag = node.tagName.toLowerCase()
    const parent: Element | null = node.parentElement
    const siblings = parent ? Array.from(parent.children).filter(c => c.tagName === node!.tagName) : []
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag)
    node = parent
  }
  return parts.join(' > ')
}

const truncate = (text: string, max = 60) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text

/**
 * The nearest landmark, e.g. 'section “Pricing”', named by its aria-label or by the closest heading
 * that comes before the element (never one inside it or after it, and never one that belongs to a
 * neighbouring landmark).
 */
export const contextFor = (el: Element): string | undefined => {
  let fallback: string | undefined
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (!node.matches(LANDMARKS)) continue
    const tag = node.tagName.toLowerCase()
    const heading = Array.from(node.querySelectorAll(HEADINGS))
      .filter(
        h =>
          !el.contains(h) &&
          h.parentElement?.closest(LANDMARKS) === node &&
          (h.contains(el) || h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) &&
          readText(h),
      )
      .at(-1)
    const label = node.getAttribute('aria-label') || (heading && readText(heading))
    if (label) return `${tag} “${truncate(label.replace(/\s+/g, ' '))}”`
    fallback ??= tag
  }
  return fallback
}

export const describe = (el: Element): Target => {
  const target: Target = {
    selector: selectorFor(el),
    tag: el.tagName.toLowerCase(),
    text: readText(el),
    context: contextFor(el),
  }
  const src = mediaSrc(el)
  if (src && (isMedia(el) || !target.text)) target.src = src
  const ownHeading = el.matches(HEADINGS) ? null : el.querySelector(HEADINGS)
  const label =
    el.getAttribute('alt') ||
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    (ownHeading && readText(ownHeading))
  if (label) target.label = truncate(label.replace(/\s+/g, ' '))
  return target
}

/**
 * Finds the element again after a reload or re-render. Tries the stored selector first, then
 * falls back to any element with the same tag and one of the expected texts.
 */
export const resolve = (target: Target, texts: string[]): HTMLElement | null => {
  const matches = (el: Element): el is HTMLElement => {
    if (!(el instanceof HTMLElement) || el.tagName.toLowerCase() !== target.tag) return false
    if (target.src) return mediaSrc(el) === target.src
    return texts.includes(readText(el))
  }

  let el: Element | null = null
  try {
    el = document.querySelector(target.selector)
  } catch {
    // Selector from an older page structure; fall through to text search.
  }
  if (el && matches(el)) return el
  if (!target.src && !texts.some(Boolean)) return null

  for (const candidate of document.querySelectorAll(target.tag)) {
    if (matches(candidate)) return candidate
  }
  return null
}

/**
 * Puts new plain text into existing markup, keeping wrappers like <strong> or <a>. Only possible
 * when the markup has a single run of text; returns null otherwise, so callers can leave the page
 * alone rather than flatten it.
 */
export const withText = (html: string, text: string): string | null => {
  const template = document.createElement('template')
  template.innerHTML = html
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  const runs: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (node.data.trim()) runs.push(node)
  }
  if (text.includes('\n') || runs.length > 1) return null
  if (runs.length === 0) {
    template.content.append(text)
  } else {
    const run = runs[0]!
    // Keep the surrounding whitespace from the source so the structure still matches.
    run.data = run.data.match(/^\s*/)![0] + text + run.data.match(/\s*$/)![0]
  }
  return template.innerHTML
}

/**
 * Writes edited HTML back in a way that survives frameworks like React: when the structure is
 * unchanged, only the text nodes are updated so the framework's node references stay valid.
 */
export const applyHTML = (el: HTMLElement, html: string) => {
  if (el.innerHTML === html) return
  const next = document.createElement('template')
  next.innerHTML = html

  const textNodes = (root: Node) => {
    const nodes: Text[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    return nodes
  }
  const shape = (root: Node): string =>
    Array.from(root.childNodes)
      .map(n => (n.nodeType === Node.ELEMENT_NODE ? `<${(n as Element).tagName}>${shape(n)}` : n.nodeType))
      .join(',')

  if (shape(el) === shape(next.content)) {
    const current = textNodes(el)
    textNodes(next.content).forEach((node, i) => {
      if (current[i] && current[i].data !== node.data) current[i].data = node.data
    })
  } else {
    el.innerHTML = html
  }
}
