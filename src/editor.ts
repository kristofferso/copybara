import { applyHTML, describe, hasOwnText, readText, resolve } from './anchor'
import { newId, type Store } from './store'
import type { Change, Mode, Page, Target } from './types'

export const currentPage = (): Page => ({
  path: location.pathname,
  title: document.title,
  lang: document.documentElement.lang || undefined,
})

const ATTR = {
  mode: 'data-copybara-mode',
  open: 'data-copybara-open',
  hover: 'data-copybara-hover',
  editing: 'data-copybara-editing',
  changed: 'data-copybara-changed',
  flash: 'data-copybara-flash',
  target: 'data-copybara-target',
} as const

const ACCENT = '229 72 42'
const NOTE = '47 99 216'
const DONE = '23 128 61'

// Injected into the host page. Only attribute selectors, so nothing matches while Copybara is idle.
const PAGE_CSS = `
html[${ATTR.mode}] [${ATTR.hover}] { outline: 2px dashed rgb(${ACCENT}) !important; outline-offset: 3px !important; cursor: text !important; }
html[${ATTR.mode}="comment"] [${ATTR.hover}] { outline-color: rgb(${NOTE}) !important; cursor: crosshair !important; }
[${ATTR.editing}] { outline: 2px solid rgb(${ACCENT}) !important; outline-offset: 3px !important; background-color: rgb(${ACCENT} / .08) !important; caret-color: rgb(${ACCENT}); cursor: text !important; -webkit-user-select: text !important; user-select: text !important; }
html:is([${ATTR.mode}], [${ATTR.open}]) [${ATTR.changed}]:not([${ATTR.editing}], [${ATTR.hover}]) { outline: 1.5px solid rgb(${DONE} / .75) !important; outline-offset: 3px !important; }
html:is([${ATTR.mode}], [${ATTR.open}]) [${ATTR.changed}="note"]:not([${ATTR.editing}], [${ATTR.hover}]) { outline-color: rgb(${NOTE} / .75) !important; }
[${ATTR.target}] { outline: 2px solid rgb(${NOTE}) !important; outline-offset: 3px !important; }
[${ATTR.flash}] { animation: copybara-flash 1.4s ease-out !important; }
@keyframes copybara-flash { 0%, 35% { box-shadow: 0 0 0 6px rgb(${ACCENT} / .45); } 100% { box-shadow: 0 0 0 18px rgb(${ACCENT} / 0); } }
`

const FORM_FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'])
const BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'auxclick', 'touchstart', 'touchend'] as const

export type EditorOptions = {
  store: Store
  ignore?: string
  /** True when the event comes from Copybara's own UI. */
  isOwn: (event: Event) => boolean
  onComment: (el: HTMLElement) => void
  /** Escape pressed while a mode is on and nothing is being edited. */
  onEscape: () => void
  /** The page changed, or changes appeared on or disappeared from it. */
  onUpdate: () => void
}

export type Editor = ReturnType<typeof createEditor>

type EditSession = {
  el: HTMLElement
  id?: string
  /** Captured when editing starts: in a single-page app the URL may change before the edit is saved. */
  page: Page
  target: Target
  originalHTML: string
  startHTML: string
  contentEditable: string | null
  spellcheck: string | null
}

export const createEditor = ({ store, ignore, isOwn, onComment, onEscape, onUpdate }: EditorOptions) => {
  let mode: Mode = 'off'
  let path = location.pathname
  let hovered: HTMLElement | null = null
  let editing: EditSession | null = null
  /** Elements currently showing a saved edit or note, by change id. */
  let applied = new Map<string, { el: HTMLElement; originalHTML?: string }>()
  const idByElement = new WeakMap<HTMLElement, string>()

  const style = document.createElement('style')
  style.setAttribute('data-copybara', '')
  style.textContent = PAGE_CSS
  document.head.append(style)

  const root = document.documentElement
  const isIgnored = (el: Element) =>
    Boolean(el.closest('[data-copybara-ignore]') || (ignore && el.closest(ignore)))

  /** The text block to edit for a pointer target: inline bits (links, bold) widen to their paragraph. */
  const editableFrom = (start: Element): HTMLElement | null => {
    let el: Element | null = start
    for (let depth = 0; el && !hasOwnText(el); depth++) {
      if (depth === 3 || el === document.body) return null
      el = el.parentElement
    }
    if (!(el instanceof HTMLElement) || FORM_FIELDS.has(el.tagName)) return null
    if (el.isContentEditable && el !== editing?.el) return null
    let block: HTMLElement = el
    while (
      block.parentElement &&
      block.parentElement !== document.body &&
      getComputedStyle(block).display === 'inline' &&
      hasOwnText(block.parentElement)
    ) {
      block = block.parentElement
    }
    return isIgnored(block) ? null : block
  }

  const mediaFrom = (start: Element): HTMLElement | null => {
    const el = start.closest('img, video, picture, canvas, iframe')
    return el instanceof HTMLElement && !isIgnored(el) ? el : null
  }

  const commentTargetFrom = (start: Element): HTMLElement | null => {
    const el = mediaFrom(start) ?? editableFrom(start) ?? start
    return el instanceof HTMLElement && el !== document.body && !isIgnored(el) ? el : null
  }

  const setHover = (el: HTMLElement | null) => {
    if (hovered === el) return
    hovered?.removeAttribute(ATTR.hover)
    hovered = el
    if (el && el !== editing?.el) el.setAttribute(ATTR.hover, '')
  }

  const placeCaret = (el: HTMLElement, x: number, y: number) => {
    const range = document.createRange()
    const position = document.caretPositionFromPoint?.(x, y)
    if (position && el.contains(position.offsetNode)) {
      range.setStart(position.offsetNode, position.offset)
    } else {
      range.selectNodeContents(el)
      range.collapse(false)
    }
    const selection = getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  const existingFor = (el: HTMLElement) => {
    const id = idByElement.get(el)
    return id ? store.get(id) : undefined
  }

  const startEdit = (el: HTMLElement, event: MouseEvent) => {
    const existing = existingFor(el)
    setHover(null)
    editing = {
      el,
      id: existing?.id,
      page: currentPage(),
      target: existing?.target ?? describe(el),
      originalHTML: existing?.edit?.originalHTML ?? el.innerHTML,
      startHTML: el.innerHTML,
      contentEditable: el.getAttribute('contenteditable'),
      spellcheck: el.getAttribute('spellcheck'),
    }
    el.setAttribute(ATTR.editing, '')
    // Not 'plaintext-only': Chrome forces `white-space: pre-wrap` on it, so indentation from the
    // HTML source starts taking up space and the layout jumps. Rich input is filtered instead.
    el.contentEditable = 'true'
    el.spellcheck = true
    el.addEventListener('blur', commit)
    el.addEventListener('paste', pastePlain)
    el.addEventListener('drop', dropPlain)
    el.focus({ preventScroll: true })
    placeCaret(el, event.clientX, event.clientY)
  }

  const insertPlain = (text: string) =>
    document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '))

  const pastePlain = (event: ClipboardEvent) => {
    event.preventDefault()
    insertPlain(event.clipboardData?.getData('text/plain') ?? '')
  }

  const dropPlain = (event: DragEvent) => {
    event.preventDefault()
    insertPlain(event.dataTransfer?.getData('text/plain') ?? '')
  }

  const endEdit = (session: EditSession) => {
    const { el } = session
    el.removeEventListener('blur', commit)
    el.removeEventListener('paste', pastePlain)
    el.removeEventListener('drop', dropPlain)
    el.removeAttribute(ATTR.editing)
    if (session.contentEditable === null) el.removeAttribute('contenteditable')
    else el.setAttribute('contenteditable', session.contentEditable)
    if (session.spellcheck === null) el.removeAttribute('spellcheck')
    else el.setAttribute('spellcheck', session.spellcheck)
    if (editing === session) editing = null
  }

  function commit() {
    const session = editing
    if (!session) return
    endEdit(session)
    const { el, target } = session
    const text = readText(el)
    const existing = session.id ? store.get(session.id) : undefined
    const now = Date.now()

    if (text === target.text) {
      if (existing) store.put({ ...existing, edit: undefined, updatedAt: now })
      return
    }

    const edit = { text, html: el.innerHTML, originalHTML: session.originalHTML }
    const change: Change = existing
      ? { ...existing, page: session.page, edit, updatedAt: now }
      : { id: newId(), page: session.page, target, edit, createdAt: now, updatedAt: now }
    idByElement.set(el, change.id)
    store.put(change)
  }

  const cancel = () => {
    const session = editing
    if (!session) return
    endEdit(session)
    applyHTML(session.el, session.startHTML)
  }

  const onPointerOver = (event: PointerEvent) => {
    if (mode === 'off' || isOwn(event)) return setHover(null)
    const target = event.target as Element
    setHover(
      mode === 'edit' ? (editableFrom(target) ?? mediaFrom(target)) : commentTargetFrom(target),
    )
  }

  const onPointerLeave = () => setHover(null)

  /** Our own UI and ignored parts of the page keep working normally while a tool is on. */
  const passThrough = (event: Event) =>
    mode === 'off' || isOwn(event) || (event.target instanceof Element && isIgnored(event.target))

  const stop = (event: Event) => {
    if (!passThrough(event)) event.stopPropagation()
  }

  const onClick = (event: MouseEvent) => {
    if (passThrough(event)) return
    event.preventDefault()
    event.stopPropagation()
    const target = event.target as Element
    if (editing?.el.contains(target)) return
    commit()

    if (mode === 'edit') {
      const el = editableFrom(target)
      if (el) return startEdit(el, event)
      const media = mediaFrom(target)
      if (media) onComment(media)
    } else {
      const el = commentTargetFrom(target)
      if (el) onComment(el)
    }
  }

  const onSubmit = (event: Event) => {
    if (passThrough(event)) return
    event.preventDefault()
    event.stopPropagation()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (isOwn(event)) return
    if (editing) {
      // Keep the site's own shortcuts from firing while typing.
      event.stopPropagation()
      if (event.isComposing) return
      const inButton = Boolean(editing.el.closest('button, summary, [role="button"]'))
      if (inButton && event.key === ' ') {
        // Buttons treat Space as a click and never insert it.
        event.preventDefault()
        document.execCommand('insertText', false, ' ')
      } else if (inButton && (event.key === 'Home' || event.key === 'End') && !event.shiftKey) {
        // Nor do they move the caret on Home/End.
        event.preventDefault()
        const range = document.createRange()
        range.selectNodeContents(editing.el)
        range.collapse(event.key === 'Home')
        getSelection()?.removeAllRanges()
        getSelection()?.addRange(range)
      } else if ((event.metaKey || event.ctrlKey) && /^[biu]$/i.test(event.key)) {
        // No bold, italic or underline: edits are about wording, not formatting.
        event.preventDefault()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        cancel()
      } else if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault()
        document.execCommand('insertLineBreak')
      } else if (event.key === 'Enter') {
        event.preventDefault()
        commit()
      }
      return
    }
    if (mode !== 'off' && event.key === 'Escape') onEscape()
  }

  const onKeyOther = (event: KeyboardEvent) => {
    if (editing && !isOwn(event)) event.stopPropagation()
  }

  /** Re-applies saved edits to the current page and marks changed elements. Idempotent. */
  const reapply = () => {
    const navigated = location.pathname !== path
    if (navigated) {
      commit()
      path = location.pathname
    }

    const next = new Map<string, { el: HTMLElement; originalHTML?: string }>()
    const taken = new Set<HTMLElement>()
    for (const change of store.all()) {
      if (change.page.path !== path) continue
      const texts = change.edit ? [change.target.text, change.edit.text] : [change.target.text]
      const el = applied.get(change.id)?.el
      const found = el?.isConnected && !taken.has(el) ? el : resolve(change.target, texts)
      if (!found || taken.has(found)) continue

      taken.add(found)
      idByElement.set(found, change.id)
      next.set(change.id, { el: found, originalHTML: change.edit?.originalHTML })
      if (change.edit && found !== editing?.el && readText(found) !== change.edit.text) {
        applyHTML(found, change.edit.html)
      }
      const kinds = [change.edit && 'edit', change.comment?.trim() && 'note'].filter(Boolean)
      found.setAttribute(ATTR.changed, kinds.join(' '))
    }

    // Anything that lost its edit goes back to how the site rendered it.
    for (const [id, { el, originalHTML }] of applied) {
      const now = next.get(id)
      if (now?.el === el && now.originalHTML) continue
      if (el !== now?.el) el.removeAttribute(ATTR.changed)
      if (originalHTML !== undefined && el.isConnected && el !== editing?.el) applyHTML(el, originalHTML)
    }
    const moved = next.size !== applied.size || [...next.keys()].some(id => !applied.has(id))
    applied = next
    if (navigated || moved) onUpdate()
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(reapply, 80)
  }

  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  const unsubscribe = store.subscribe(reapply)

  const listen = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) =>
    window.addEventListener(type, fn as EventListener, true)
  const unlisten = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) =>
    window.removeEventListener(type, fn as EventListener, true)

  listen('pointerover', onPointerOver)
  document.documentElement.addEventListener('pointerleave', onPointerLeave)
  listen('click', onClick)
  listen('submit', onSubmit)
  listen('keydown', onKeyDown)
  listen('keyup', onKeyOther)
  listen('keypress', onKeyOther)
  listen('popstate', schedule)
  BLOCKED_EVENTS.forEach(type => listen(type, stop))

  reapply()

  return {
    get mode() {
      return mode
    },
    /**
     * Public contract: `<html data-copybara-mode="edit|comment">` while a tool is on (absent when
     * off), plus a `copybara:mode` event on window, so a site can style or wire its own buttons.
     */
    setMode(next: Mode) {
      commit()
      const changed = next !== mode
      mode = next
      setHover(null)
      if (next === 'off') root.removeAttribute(ATTR.mode)
      else root.setAttribute(ATTR.mode, next)
      if (changed) window.dispatchEvent(new CustomEvent('copybara:mode', { detail: { mode: next } }))
    },
    setOpen(open: boolean) {
      root.toggleAttribute(ATTR.open, open)
    },
    /** Element for a change on the current page, if it is rendered. */
    elementFor: (change: Change) => applied.get(change.id)?.el ?? null,
    isOnPage: (change: Change) => applied.has(change.id),
    locate(change: Change) {
      const el = applied.get(change.id)?.el
      if (!el) return false
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.removeAttribute(ATTR.flash)
      void el.offsetWidth
      el.setAttribute(ATTR.flash, '')
      setTimeout(() => el.removeAttribute(ATTR.flash), 1500)
      return true
    },
    commentOn(el: HTMLElement, comment: string) {
      const existing = existingFor(el)
      const now = Date.now()
      const change: Change = existing
        ? { ...existing, comment, updatedAt: now }
        : { id: newId(), page: currentPage(), target: describe(el), comment, createdAt: now, updatedAt: now }
      idByElement.set(el, change.id)
      store.put(change)
    },
    commentFor: (el: HTMLElement) => existingFor(el)?.comment ?? '',
    setTarget(el: HTMLElement | null) {
      document.querySelectorAll(`[${ATTR.target}]`).forEach(node => node.removeAttribute(ATTR.target))
      el?.setAttribute(ATTR.target, '')
    },
    describe: (el: HTMLElement) => existingFor(el)?.target ?? describe(el),
    reapply,
    destroy() {
      commit()
      clearTimeout(timer)
      observer.disconnect()
      unsubscribe()
      unlisten('pointerover', onPointerOver)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      unlisten('click', onClick)
      unlisten('submit', onSubmit)
      unlisten('keydown', onKeyDown)
      unlisten('keyup', onKeyOther)
      unlisten('keypress', onKeyOther)
      unlisten('popstate', schedule)
      BLOCKED_EVENTS.forEach(type => unlisten(type, stop))
      setHover(null)
      document.querySelectorAll(`[${ATTR.target}]`).forEach(node => node.removeAttribute(ATTR.target))
      for (const { el, originalHTML } of applied.values()) {
        el.removeAttribute(ATTR.changed)
        if (originalHTML !== undefined) applyHTML(el, originalHTML)
      }
      applied.clear()
      root.removeAttribute(ATTR.mode)
      root.removeAttribute(ATTR.open)
      if (mode !== 'off') window.dispatchEvent(new CustomEvent('copybara:mode', { detail: { mode: 'off' } }))
      style.remove()
    },
  }
}

