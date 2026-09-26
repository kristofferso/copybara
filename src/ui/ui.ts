import avatarImage from '../assets/avatar.webp'
import notesImage from '../assets/taking-notes.webp'
import yesImage from '../assets/yes.webp'
import { diffWords } from '../diff'
import { withText } from '../anchor'
import { currentPage, type Editor } from '../editor'
import { groupByPage, toMarkdown, toPrompt, type PageGroup } from '../export'
import type { Store } from '../store'
import type { Change, CopybaraConfig, Mode } from '../types'
import { h } from './h'
import { icon, type IconName } from './icons'
import { css } from './styles'

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

type Prefs = { open: boolean; mode: Mode; tool: Tool }

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
  } catch {
    // Fall back to defaults.
  }
  return prefs
}

export const createUi = ({ host, store, editor, config }: UiOptions) => {
  const prefsKey = `${config.storageKey ?? 'copybara'}:ui`
  const prefs = readPrefs(prefsKey)
  const savePrefs = () => {
    try {
      sessionStorage.setItem(prefsKey, JSON.stringify(prefs))
    } catch {
      // Not important enough to surface.
    }
  }

  let confirmClear = false
  let confirmTimer: ReturnType<typeof setTimeout> | undefined
  let editingId: string | null = null
  const noteOpen = new Set<string>()
  /** Page groups the reviewer folded or unfolded by hand. */
  const toggled = new Map<string, boolean>()
  let noteTarget: HTMLElement | null = null
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let dirty = false

  const shadow = host.attachShadow({ mode: 'open' })
  const panel = h('section', { class: 'panel', role: 'dialog', 'aria-label': 'Copybara' })
  const launcher = h('button', { class: 'launcher', onclick: () => setOpen(!prefs.open) })
  const popover = h('div', { class: 'popover', role: 'dialog', 'aria-label': 'Add a note', hidden: true })
  const toast = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' })
  const root = h(
    'div',
    { class: 'root', 'data-pos': config.position ?? 'bottom-left', 'data-theme': config.theme ?? 'auto' },
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
          title: on ? 'Turn off and use the page as normal' : 'Turn on to edit and comment',
          onclick: () => setMode(on ? 'off' : prefs.tool),
        },
        on ? 'On' : 'Off',
        h('span', { class: 'track' }),
      ),
      iconButton('close', 'Close panel', () => setOpen(false)),
    )
  }

  const tools = () =>
    h(
      'div',
      { class: 'tools', role: 'group', 'aria-label': 'Tool' },
      TOOLS.map(([tool, iconName, label]) =>
        h(
          'button',
          { class: 'tool', 'data-tool': tool, 'aria-pressed': String(prefs.mode === tool), onclick: () => setMode(tool) },
          icon(iconName),
          label,
        ),
      ),
    )

  const hint = () => {
    const kbd = (key: string) => h('kbd', {}, key)
    if (prefs.mode === 'edit') {
      return h('p', { class: 'hint' }, 'Click any text on the page to rewrite it. ', kbd('Enter'), ' saves, ', kbd('Shift'), ' ', kbd('Enter'), ' adds a line, ', kbd('Esc'), ' cancels.')
    }
    if (prefs.mode === 'comment') {
      return h('p', { class: 'hint' }, 'Click any text, image or section to leave a note about it.')
    }
    return h('p', { class: 'hint' }, 'Copybara is off, so the page works as usual. Pick a tool to start.')
  }

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
      hint(),
      h(
        'div',
        { class: 'list' },
        changes.length
          ? [
              ...groups.map(g => group(g, g.page.path === page.path, groups.length === 1)),
              h('button', { class: `clear${confirmClear ? ' danger' : ''}`, onclick: onClear }, confirmClear ? 'Click again to discard everything' : 'Clear all changes'),
            ]
          : empty(),
      ),
      footer(changes),
    )
    const list = panel.querySelector('.list')
    if (list) list.scrollTop = scrollTop
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

  function onClear() {
    clearTimeout(confirmTimer)
    if (!confirmClear) {
      confirmClear = true
      confirmTimer = setTimeout(() => {
        confirmClear = false
        render()
      }, 3000)
    } else {
      confirmClear = false
      store.clear()
    }
    render()
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

  const onViewport = () => requestAnimationFrame(placePopover)
  window.addEventListener('scroll', onViewport, true)
  window.addEventListener('resize', onViewport)

  // Pick up deferred renders once typing is done.
  shadow.addEventListener('focusout', () => setTimeout(() => dirty && render()))

  const unsubscribe = store.subscribe(render)

  return {
    render,
    openNote,
    setMode,
    /** Applies saved preferences; call once the editor exists. */
    start() {
      editor().setMode(prefs.mode)
      editor().setOpen(prefs.open)
      render()
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    destroy() {
      unsubscribe()
      clearTimeout(toastTimer)
      clearTimeout(confirmTimer)
      window.removeEventListener('scroll', onViewport, true)
      window.removeEventListener('resize', onViewport)
    },
  }
}
