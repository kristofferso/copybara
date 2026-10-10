// Sized for the panel (2x the displayed size). The larger originals are for the website.
import avatarImage from '../assets/ui/avatar.webp'
import notesImage from '../assets/ui/notes.webp'
import yesImage from '../assets/ui/yes.webp'
import { diffWords } from '../diff.js'
import { withText } from '../anchor.js'
import { currentPage, type Editor } from '../editor.js'
import { groupByPage, toMarkdown, toPrompt, type PageGroup } from '../export.js'
import type { Store } from '../store.js'
import type { Change, CopybaraConfig, Corner, Mode } from '../types.js'
import { h } from './h.js'
import { icon, type IconName } from './icons.js'
import { css } from './styles.js'

export const HOST_TAG = 'copybara-ui'

type Tool = Exclude<Mode, 'off'>

const TOOLS: [Tool, IconName, string][] = [
  ['edit', 'pencil', 'Edit text'],
  ['comment', 'note', 'Comment'],
]

// Where changes will go once the hosted service exists. Shown disabled so the direction is clear.
const DESTINATIONS: [IconName, string][] = [
  ['pr', 'Pull request'],
  ['ticket', 'Linear'],
  ['ticket', 'Jira'],
]

const DEFAULT_SHORTCUT = 'alt+c'
const DOUBLE_CLICK_MS = 220

// What dialogs listen to for "clicked or focused outside". Our UI only uses click, input, keys and
// focusout, so these are safe to hide from the page.
const OUTSIDE_EVENTS = ['focusin', 'pointerdown', 'mousedown', 'touchstart'] as const

const isModal = (dialog: Element) => {
  try {
    return dialog.matches(':modal')
  } catch {
    return false
  }
}

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** 'alt+c', 'mod+shift+e' and the like. `mod` is ⌘ on a Mac and Ctrl elsewhere. */
export const parseShortcut = (spec: string) => {
  const parts = spec.toLowerCase().split('+').map(part => part.trim())
  const key = parts.pop() ?? ''
  const want = { alt: false, shift: false, ctrl: false, meta: false }
  for (const part of parts) {
    if (part === 'mod') want[MAC ? 'meta' : 'ctrl'] = true
    else if (part === 'cmd' || part === 'meta') want.meta = true
    else if (part === 'option' || part === 'alt') want.alt = true
    else if (part === 'control' || part === 'ctrl') want.ctrl = true
    else if (part === 'shift') want.shift = true
  }
  // Match letters and digits by physical key: Option on a Mac turns 'c' into 'ç'.
  const code = /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : /^[0-9]$/.test(key) ? `Digit${key}` : null
  const names = { alt: MAC ? '⌥' : 'Alt+', shift: MAC ? '⇧' : 'Shift+', ctrl: MAC ? '⌃' : 'Ctrl+', meta: MAC ? '⌘' : 'Win+' }
  const label =
    (['ctrl', 'alt', 'shift', 'meta'] as const).filter(m => want[m]).map(m => names[m]).join('') + key.toUpperCase()
  return {
    label,
    matches: (event: KeyboardEvent) =>
      event.altKey === want.alt &&
      event.shiftKey === want.shift &&
      event.ctrlKey === want.ctrl &&
      event.metaKey === want.meta &&
      (code ? event.code === code : event.key.toLowerCase() === key),
  }
}

const CORNERS: Corner[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right']
/** How far the pointer has to move before a press on the launcher becomes a drag. */
const DRAG_THRESHOLD = 6

/** Where the reviewer dragged the launcher to, if anywhere. Kept for the browser tab. */
type Prefs = { open: boolean; mode: Mode; tool: Tool; corner?: Corner }

type UiOptions = {
  host: HTMLElement
  store: Store
  editor: () => Editor
  config: CopybaraConfig
}

export type Ui = ReturnType<typeof createUi>

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const writeClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Insecure context or denied permission: fall back to a hidden textarea.
    const area = document.createElement('textarea')
    area.value = text
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

const readPrefs = (key: string): Prefs => {
  const prefs: Prefs = { open: false, mode: 'off', tool: 'edit' }
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? '{}')
    if (typeof saved.open === 'boolean') prefs.open = saved.open
    if (saved.mode === 'edit' || saved.mode === 'comment') prefs.mode = prefs.tool = saved.mode
    if (saved.tool === 'edit' || saved.tool === 'comment') prefs.tool = saved.tool
    if (CORNERS.includes(saved.corner)) prefs.corner = saved.corner
  } catch {
    // Fall back to defaults.
  }
  return prefs
}

export const createUi = ({ host, store, editor, config }: UiOptions) => {
  const shortcut = config.shortcut === false ? null : parseShortcut(config.shortcut ?? DEFAULT_SHORTCUT)
  const prefsKey = `${config.storageKey ?? 'copybara'}:ui`
  const prefs = readPrefs(prefsKey)
  const savePrefs = () => {
    try {
      sessionStorage.setItem(prefsKey, JSON.stringify(prefs))
    } catch {
      // Not important enough to surface.
    }
  }

  /** The small popover open in the panel header, if any. */
  let menu: 'keys' | 'clear' | null = null
  let editingId: string | null = null
  const noteOpen = new Set<string>()
  /** Page groups the reviewer folded or unfolded by hand. */
  const toggled = new Map<string, boolean>()
  let noteTarget: HTMLElement | null = null
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let dirty = false
  let destroyed = false

  const shadow = host.attachShadow({ mode: 'open' })
  const panel = h('section', { class: 'panel', role: 'dialog', 'aria-label': 'Copybara' })
  // A click opens the panel, a double click switches the tools on or off without opening it. The
  // single click waits a moment so a double click doesn't flash the panel open and shut.
  let clickTimer: ReturnType<typeof setTimeout> | undefined
  const launcher = h('button', {
    class: 'launcher',
    title: `${shortcut ? `Double-click or press ${shortcut.label}` : 'Double-click'} to turn on or off. Drag to move.`,
    onclick: (event: MouseEvent) => {
      clearTimeout(clickTimer)
      // The press that ended a drag is not a click.
      if (dragged) return void (dragged = false)
      if (event.detail > 1) return
      // Keyboard and assistive tech clicks have no double click to wait for.
      if (event.detail === 0) return setOpen(!prefs.open)
      clickTimer = setTimeout(() => setOpen(!prefs.open), DOUBLE_CLICK_MS)
    },
    ondblclick: () => {
      clearTimeout(clickTimer)
      toggle()
    },
  })
  const popover = h('div', { class: 'popover', role: 'dialog', 'aria-label': 'Add a note', hidden: true })
  const toast = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' })
  const root = h(
    'div',
    { class: 'root', 'data-pos': prefs.corner ?? config.position ?? 'bottom-left', 'data-theme': config.theme ?? 'auto' },
    panel,
    launcher,
    popover,
    toast,
  )
  shadow.append(h('style', {}, css), root)

  // Keystrokes typed into our fields should not trigger the site's shortcuts.
  const swallow = (event: Event) => event.stopPropagation()
  host.addEventListener('keydown', swallow)
  host.addEventListener('keyup', swallow)

  // Modal dialogs and drawers (Radix, shadcn, Headless UI, focus-trap) treat our UI as "outside":
  // they pull focus back out of the note field and close on clicks in the panel. Hide those
  // events from them. This runs on window in the capture phase, ahead of any listener they add.
  const isOwn = (event: Event) => event.composedPath().includes(host)
  const hideOwn = (event: Event) => {
    if (isOwn(event)) event.stopPropagation()
  }
  // Focus leaving the page for our UI: a trap would pull it straight back.
  const hideFocusOut = (event: FocusEvent) => {
    if (event.relatedTarget === host) event.stopPropagation()
  }
  for (const type of OUTSIDE_EVENTS) window.addEventListener(type, hideOwn, true)
  window.addEventListener('focusout', hideFocusOut, true)

  // A native modal <dialog> makes everything outside it inert and draws over it, so the UI has to
  // live inside the topmost one while it is open.
  const restack = () => {
    const modals = [...document.querySelectorAll('dialog[open]')].filter(isModal)
    const parent = modals.at(-1) ?? document.body
    if (host.parentNode !== parent) parent.append(host)
  }
  const onLayer = (event: Event) => {
    if (event.target instanceof HTMLDialogElement) restack()
  }
  window.addEventListener('toggle', onLayer, true)
  window.addEventListener('close', onLayer, true)
  // A dialog removed while open takes the UI with it.
  const layers = new MutationObserver(() => host.isConnected || restack())
  layers.observe(document.body, { childList: true, subtree: true })

  // Dragging the launcher snaps it to the nearest corner. Listening on window in the capture
  // phase: pointerdown from our UI is hidden from the page above, and the editor may stop the rest.
  let drag: { id: number; x: number; y: number; moved: boolean } | null = null
  let dragged = false

  const onDragStart = (event: PointerEvent) => {
    if (event.button !== 0 || !event.composedPath().includes(launcher)) return
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
  }

  const onDragMove = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      drag.moved = true
      clearTimeout(clickTimer)
      launcher.setPointerCapture?.(event.pointerId)
      root.setAttribute('data-dragging', '')
    }
    launcher.style.translate = `${dx}px ${dy}px`
  }

  const onDragEnd = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return
    const { moved } = drag
    drag = null
    if (!moved) return
    dragged = event.type === 'pointerup'
    // A click may not follow, e.g. when the pointer was released outside the launcher.
    setTimeout(() => (dragged = false))
    const corner: Corner = `${event.clientY < innerHeight / 2 ? 'top' : 'bottom'}-${event.clientX < innerWidth / 2 ? 'left' : 'right'}`
    // Glide from where it was let go into the corner.
    const items = [launcher, panel].map(el => ({ el, from: el.getBoundingClientRect() }))
    launcher.style.translate = ''
    root.removeAttribute('data-dragging')
    if (event.type === 'pointerup') setCorner(corner)
    for (const { el, from } of items) {
      const to = el.getBoundingClientRect()
      el.animate?.([{ translate: `${from.left - to.left}px ${from.top - to.top}px` }, { translate: '0 0' }], {
        duration: 280,
        easing: 'cubic-bezier(.2, .9, .25, 1)',
      })
    }
  }

  const setCorner = (corner: Corner) => {
    prefs.corner = corner
    savePrefs()
    root.dataset.pos = corner
  }

  window.addEventListener('pointerdown', onDragStart, true)
  window.addEventListener('pointermove', onDragMove, true)
  window.addEventListener('pointerup', onDragEnd, true)
  window.addEventListener('pointercancel', onDragEnd, true)

  const onShortcut = (event: KeyboardEvent) => {
    if (!shortcut || event.repeat || event.isComposing || !shortcut.matches(event)) return
    event.preventDefault()
    event.stopPropagation()
    toggle()
  }
  window.addEventListener('keydown', onShortcut, true)

  const avatar = () => h('span', { class: 'avatar', style: `background-image:url("${avatarImage}")` })

  const iconButton = (name: IconName, label: string, onclick: () => void) =>
    h('button', { class: 'icon-btn', title: label, 'aria-label': label, onclick }, icon(name))

  const focusIn = (id: string, selector: string) =>
    shadow.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] ${selector}`)?.focus()

  const where = (change: Pick<Change, 'target'>) => {
    const { tag, context } = change.target
    return [h('code', {}, tag), context ? ` in ${context}` : '']
  }

  // Panel ---------------------------------------------------------------------------------------

  const header = (changes: Change[], groups: PageGroup[]) => {
    const on = prefs.mode !== 'off'
    const meta = changes.length
      ? `${plural(changes.length, 'change')} on ${plural(groups.length, 'page')}`
      : 'No changes yet'
    return h(
      'header',
      { class: 'head' },
      avatar(),
      h('div', { class: 'brand' }, h('span', { class: 'wordmark' }, 'Copybara'), h('span', { class: 'meta' }, meta)),
      h(
        'button',
        {
          class: 'switch',
          role: 'switch',
          'aria-checked': String(on),
          title: (on ? 'Turn off and use the page as normal' : 'Turn on to edit and comment') + (shortcut ? ` (${shortcut.label})` : ''),
          onclick: toggle,
        },
        on ? 'On' : 'Off',
        h('span', { class: 'track' }),
      ),
      menuButton('keys', 'help', 'Keyboard shortcuts', keysMenu),
      changes.length > 0 && menuButton('clear', 'trash', 'Clear all changes', () => clearMenu(changes)),
      iconButton('close', 'Close panel', () => setOpen(false)),
    )
  }

  /** An icon button in the header that opens a small popover below it. */
  const menuButton = (name: NonNullable<typeof menu>, iconName: IconName, label: string, content: () => Node) =>
    h(
      'div',
      { class: 'menu', 'data-menu': name },
      h(
        'button',
        { class: 'icon-btn', title: label, 'aria-label': label, 'aria-expanded': String(menu === name), onclick: () => setMenu(menu === name ? null : name) },
        icon(iconName),
      ),
      menu === name && content(),
    )

  const clearMenu = (changes: Change[]) =>
    h(
      'div',
      { class: 'menu-pop', role: 'alertdialog', 'aria-label': 'Clear all changes' },
      h('p', { class: 'menu-title' }, `Discard ${plural(changes.length, 'change')}?`),
      h('p', {}, 'Every edit and note on every page goes. This cannot be undone.'),
      h(
        'div',
        { class: 'pop-actions' },
        h('button', { class: 'btn', onclick: () => setMenu(null) }, 'Cancel'),
        h('button', { class: 'btn danger', 'data-autofocus': '', onclick: clearAll }, 'Discard all'),
      ),
    )

  const keysMenu = () => {
    const keys = (...names: string[]) => h('span', { class: 'keys' }, names.map(name => h('kbd', {}, name)))
    const row = (combo: Node, what: string) => h('li', {}, combo, h('span', {}, what))
    return h(
      'div',
      { class: 'menu-pop keys-pop', role: 'dialog', 'aria-label': 'Keyboard shortcuts' },
      h('p', { class: 'menu-title' }, 'Shortcuts'),
      h(
        'ul',
        {},
        shortcut && row(keys(shortcut.label), 'Turn Copybara on or off'),
        row(h('span', { class: 'keys' }, 'Double-click'), 'Same, on the Copybara button'),
        row(h('span', { class: 'keys' }, 'Drag'), 'Move the button to another corner'),
      ),
      h('p', { class: 'menu-sub' }, 'While editing text'),
      h(
        'ul',
        {},
        row(keys('Enter'), 'Save'),
        row(keys('Shift', 'Enter'), 'New line'),
        row(keys('Esc'), 'Cancel. Press again to turn off'),
      ),
      h('p', { class: 'menu-sub' }, 'In a note'),
      h('ul', {}, row(keys(MAC ? '⌘' : 'Ctrl', 'Enter'), 'Save the note'), row(keys('Esc'), 'Close')),
    )
  }

  const tools = () =>
    h(
      'div',
      { class: 'tools', role: 'group', 'aria-label': 'Tool' },
      TOOLS.map(([tool, iconName, label]) =>
        h(
          'button',
          {
            class: 'tool',
            'data-tool': tool,
            'aria-pressed': String(prefs.mode === tool),
            // Clicking the tool that is on turns Copybara off.
            onclick: () => setMode(prefs.mode === tool ? 'off' : tool),
          },
          icon(iconName),
          label,
        ),
      ),
    )

  const diffView = (change: Change) =>
    h(
      'button',
      {
        class: 'diff',
        title: 'Edit the new text',
        onclick: () => {
          editingId = change.id
          render()
          focusIn(change.id, 'textarea.edit-text')
        },
      },
      diffWords(change.target.text, change.edit!.text).map(part =>
        part.type === 'same' ? part.value : h('span', { class: part.type }, part.value),
      ),
    )

  const editField = (change: Change) =>
    h('textarea', {
      class: 'edit-text',
      value: change.edit!.text,
      'aria-label': 'New text',
      oninput: (event: Event) => {
        const text = (event.target as HTMLTextAreaElement).value
        const current = store.get(change.id)
        if (!current?.edit) return
        // Keep the edit while typing, even if it briefly matches the original; blur decides.
        // When the markup can't take the new text as-is, the page keeps its last version and
        // the list and export carry the new text.
        const html = withText(current.edit.html, text) ?? current.edit.html
        store.put({ ...current, edit: { ...current.edit, text, html }, updatedAt: Date.now() })
      },
      onfocusout: () => {
        editingId = null
        const current = store.get(change.id)
        if (current?.edit && current.edit.text === current.target.text) {
          store.put({ ...current, edit: undefined, updatedAt: Date.now() })
        }
        queueMicrotask(render)
      },
    })

  const noteField = (change: Change) =>
    h('textarea', {
      class: 'note',
      value: change.comment ?? '',
      placeholder: 'What should change here?',
      'aria-label': 'Note',
      oninput: (event: Event) => {
        const current = store.get(change.id) ?? change
        store.put({ ...current, comment: (event.target as HTMLTextAreaElement).value, updatedAt: Date.now() })
      },
      onfocusout: () => {
        noteOpen.delete(change.id)
        queueMicrotask(render)
      },
    })

  const card = (change: Change, onPage: boolean) => {
    const { target } = change
    const located = onPage && editor().isOnPage(change)
    const hasNote = Boolean(change.comment?.trim()) || noteOpen.has(change.id)

    let content: Node | null = null
    if (change.edit) content = editingId === change.id ? editField(change) : diffView(change)
    else if (target.src) content = h('img', { class: 'thumb', src: target.src, alt: target.label ?? '' })
    else if (target.text) content = h('p', { class: 'quote' }, target.text)

    return h(
      'article',
      { class: 'card', 'data-id': change.id, 'data-kind': change.edit ? 'edit' : 'note' },
      h(
        'div',
        { class: 'card-top' },
        h('span', { class: 'kind', title: change.edit ? 'Text change' : 'Note' }, icon(change.edit ? 'pencil' : 'note')),
        h('span', { class: 'where', title: target.context ?? '' }, where(change)),
        h(
          'div',
          { class: 'actions' },
          located && iconButton('target', 'Show on page', () => editor().locate(change)),
          iconButton('trash', 'Discard', () => store.remove(change.id)),
        ),
      ),
      content,
      hasNote
        ? noteField(change)
        : h(
            'button',
            {
              class: 'add-note',
              onclick: () => {
                noteOpen.add(change.id)
                render()
                focusIn(change.id, 'textarea.note')
              },
            },
            '+ Add note',
          ),
    )
  }

  // Other pages start folded so the current page stays in focus.
  const group = ({ page, changes }: PageGroup, current: boolean, only: boolean) => {
    const details = h(
      'details',
      { class: 'group', open: toggled.get(page.path) ?? (current || only) },
      h(
        'summary',
        {},
        h('span', { class: 'page-title' }, current ? 'This page' : page.title || 'Untitled'),
        h('span', { class: 'page-path' }, page.path),
        h('span', { class: 'count' }, String(changes.length)),
      ),
      !current && h('a', { class: 'go', href: page.path }, 'Go to page', icon('arrow')),
      h('div', { class: 'cards' }, changes.map(change => card(change, current))),
    )
    details.addEventListener('toggle', () => toggled.set(page.path, details.open))
    return details
  }

  const empty = () => {
    if (prefs.mode === 'off') {
      return h(
        'div',
        { class: 'empty' },
        h(
          'div',
          { class: 'empty-text' },
          h('p', { class: 'empty-title' }, 'Review this site'),
          h('p', {}, 'Rewrite text and leave notes right on the page. Everything ends up in one list.'),
          h('button', { class: 'btn primary', onclick: () => setMode(prefs.tool) }, icon('pencil'), 'Start reviewing'),
        ),
        h('img', { class: 'empty-art', src: notesImage, alt: '' }),
      )
    }
    const [title, body] =
      prefs.mode === 'edit'
        ? ['Click any text', 'Headings, buttons, links, fine print. Rewrite it where it lives.']
        : ['Point at something', 'Leave a note on an image, a section or a sentence.']
    return h(
      'div',
      { class: 'empty' },
      h('div', { class: 'empty-text' }, h('p', { class: 'empty-title' }, title), h('p', {}, body)),
      h('img', { class: 'empty-art', src: notesImage, alt: '' }),
    )
  }

  const footer = (changes: Change[]) =>
    h(
      'footer',
      { class: 'foot' },
      h(
        'div',
        { class: 'export' },
        h('button', { class: 'btn primary', disabled: !changes.length, onclick: copyPrompt }, icon('prompt'), 'Copy as prompt'),
        h('button', { class: 'btn', disabled: !changes.length, onclick: copyMarkdown, title: 'Copy as a Markdown changelog' }, icon('file'), 'Markdown'),
      ),
      h(
        'div',
        { class: 'send', title: 'Send changes straight to a pull request or your issue tracker. Coming soon.' },
        h('span', {}, 'Send to'),
        DESTINATIONS.map(([iconName, label]) => h('span', { class: 'dest' }, icon(iconName), label)),
        h('span', { class: 'soon' }, 'Soon'),
      ),
    )

  const renderLauncher = (count: number) => {
    const label = prefs.mode === 'edit' ? 'Editing' : prefs.mode === 'comment' ? 'Commenting' : 'Copybara'
    launcher.dataset.mode = prefs.mode
    launcher.setAttribute('aria-expanded', String(prefs.open))
    launcher.setAttribute('aria-label', prefs.open ? 'Close Copybara' : 'Open Copybara')
    launcher.replaceChildren(
      avatar(),
      label,
      ...(prefs.mode !== 'off' ? [h('span', { class: 'live', 'aria-hidden': 'true' })] : []),
      ...(count > 0 ? [h('span', { class: 'badge', 'aria-label': plural(count, 'change') }, String(count))] : []),
    )
  }

  function render() {
    // Deferred renders (focusout, microtasks) can land after destroy().
    if (destroyed) return
    // Never rebuild under a field the reviewer is typing in; catch up when it loses focus.
    if (shadow.activeElement instanceof HTMLTextAreaElement) {
      dirty = true
      return
    }
    dirty = false
    const changes = store.all()
    const page = currentPage()
    const groups = groupByPage(changes, page.path)

    renderLauncher(changes.length)
    panel.toggleAttribute('data-open', prefs.open)
    if (!prefs.open) return panel.replaceChildren()
    // Rebuilding the panel would reset the list to the top; keep the reviewer where they were.
    const scrollTop = panel.querySelector('.list')?.scrollTop ?? 0
    panel.replaceChildren(
      header(changes, groups),
      tools(),
      h(
        'div',
        { class: 'list' },
        changes.length
          ? groups.map(g => group(g, g.page.path === page.path, groups.length === 1))
          : empty(),
      ),
      footer(changes),
    )
    const list = panel.querySelector('.list')
    if (list) list.scrollTop = scrollTop
    placeMenu()
  }

  // Actions -------------------------------------------------------------------------------------

  function setOpen(open: boolean) {
    prefs.open = open
    savePrefs()
    editor().setOpen(open)
    render()
  }

  function setMode(mode: Mode) {
    prefs.mode = mode
    if (mode !== 'off') prefs.tool = mode
    savePrefs()
    editor().setMode(mode)
    closeNote()
    render()
  }

  /** On with the last tool used, or off. */
  function toggle() {
    setMode(prefs.mode === 'off' ? prefs.tool : 'off')
  }

  /** Below its button, right-aligned with it, kept inside the viewport. */
  function placeMenu() {
    const pop = panel.querySelector<HTMLElement>('.menu-pop')
    const button = pop?.previousElementSibling
    if (!pop || !button) return
    const rect = button.getBoundingClientRect()
    const width = pop.offsetWidth
    const height = pop.offsetHeight
    const left = Math.min(Math.max(12, rect.right + 8 - width), innerWidth - width - 12)
    let top = rect.bottom + 6
    if (top + height > innerHeight - 12) top = rect.top - height - 6
    pop.style.left = `${left}px`
    pop.style.top = `${Math.min(Math.max(12, top), innerHeight - height - 12)}px`
  }

  function setMenu(next: typeof menu) {
    menu = next
    render()
    shadow.querySelector<HTMLElement>('.menu-pop [data-autofocus]')?.focus()
  }

  function clearAll() {
    menu = null
    store.clear()
  }

  const showToast = (title: string, body: string) => {
    clearTimeout(toastTimer)
    toast.replaceChildren(h('img', { src: yesImage, alt: '' }), h('div', {}, h('strong', {}, title), h('span', {}, body)))
    toast.removeAttribute('data-show')
    void toast.offsetWidth
    toast.setAttribute('data-show', '')
    toastTimer = setTimeout(() => toast.removeAttribute('data-show'), 2800)
  }

  const exportOptions = () => ({ origin: location.origin, instructions: config.instructions, codebase: config.codebase })

  async function copyPrompt() {
    await writeClipboard(toPrompt(store.all(), exportOptions()))
    showToast('Copied', 'Paste it into Claude Code, Cursor or any coding agent.')
  }

  async function copyMarkdown() {
    await writeClipboard(toMarkdown(store.all(), exportOptions()))
    showToast('Copied as Markdown', 'Ready for an issue, a pull request or a chat.')
  }

  // Note popover --------------------------------------------------------------------------------

  const placePopover = () => {
    if (!noteTarget || popover.hidden) return
    const rect = noteTarget.getBoundingClientRect()
    const width = popover.offsetWidth
    const height = popover.offsetHeight
    const left = Math.min(Math.max(12, rect.left), innerWidth - width - 12)
    let top = rect.bottom + 12
    if (top + height > innerHeight - 12) top = rect.top - height - 12
    // Tall targets (whole sections): keep the popover on screen.
    popover.style.left = `${left}px`
    popover.style.top = `${Math.min(Math.max(12, top), innerHeight - height - 12)}px`
  }

  function openNote(el: HTMLElement) {
    restack()
    noteTarget = el
    editor().setTarget(el)
    const target = editor().describe(el)
    const field = h('textarea', {
      value: editor().commentFor(el),
      placeholder: 'What should change here?',
      'aria-label': 'Note',
      onkeydown: (event: KeyboardEvent) => {
        if (event.key === 'Escape') closeNote()
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save()
      },
    })
    const save = () => {
      editor().commentOn(el, field.value.trim())
      closeNote()
    }
    const mac = /Mac|iPhone|iPad/.test(navigator.platform)
    popover.replaceChildren(
      h('div', { class: 'pop-head' }, icon('note'), h('span', { class: 'where' }, 'Note on ', where({ target }))),
      field,
      h(
        'div',
        { class: 'pop-actions' },
        h('span', { class: 'kbd-hint' }, mac ? '⌘ Enter to save' : 'Ctrl Enter to save'),
        h('button', { class: 'btn', onclick: closeNote }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: save }, 'Save note'),
      ),
    )
    popover.hidden = false
    placePopover()
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
  }

  function closeNote() {
    if (popover.hidden) return
    popover.hidden = true
    noteTarget = null
    editor().setTarget(null)
    if (dirty) render()
  }

  const onViewport = () =>
    requestAnimationFrame(() => {
      placePopover()
      placeMenu()
    })
  window.addEventListener('scroll', onViewport, true)
  window.addEventListener('resize', onViewport)

  // Header popovers close on a click elsewhere or Escape.
  shadow.addEventListener('click', event => {
    if (menu && !event.composedPath().some(node => node instanceof Element && node.classList.contains('menu'))) {
      setMenu(null)
    }
  })
  shadow.addEventListener('keydown', event => {
    if (menu && (event as KeyboardEvent).key === 'Escape') setMenu(null)
  })

  // Pick up deferred renders once typing is done.
  shadow.addEventListener('focusout', () => setTimeout(() => dirty && render()))

  const unsubscribe = store.subscribe(render)

  return {
    render,
    openNote,
    setMode,
    /** Applies saved preferences; call once the editor exists. */
    start() {
      restack()
      editor().setMode(prefs.mode)
      editor().setOpen(prefs.open)
      render()
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    destroy() {
      destroyed = true
      unsubscribe()
      clearTimeout(toastTimer)
      window.removeEventListener('scroll', onViewport, true)
      window.removeEventListener('resize', onViewport)
      for (const type of OUTSIDE_EVENTS) window.removeEventListener(type, hideOwn, true)
      window.removeEventListener('focusout', hideFocusOut, true)
      window.removeEventListener('toggle', onLayer, true)
      window.removeEventListener('close', onLayer, true)
      window.removeEventListener('keydown', onShortcut, true)
      window.removeEventListener('pointerdown', onDragStart, true)
      window.removeEventListener('pointermove', onDragMove, true)
      window.removeEventListener('pointerup', onDragEnd, true)
      window.removeEventListener('pointercancel', onDragEnd, true)
      layers.disconnect()
      clearTimeout(clickTimer)
    },
  }
}
