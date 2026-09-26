import { createEditor, type Editor } from './editor'
import { createStore } from './store'
import type { CopybaraConfig, CopybaraInstance } from './types'
import { createUi, HOST_TAG, type Ui } from './ui/ui'

export type { Change, CodebaseIntel, CopybaraConfig, CopybaraInstance, Mode, Page, Target, TextEdit } from './types'
export { toMarkdown, toPrompt, type ExportOptions } from './export'

const noop: CopybaraInstance = { open() {}, close() {}, setMode() {}, destroy() {} }

let active: CopybaraInstance | null = null

/**
 * Mounts Copybara on the page. Calling it again replaces the previous instance.
 * Safe to call during server rendering, where it does nothing.
 */
export const init = (config: CopybaraConfig = {}): CopybaraInstance => {
  if (typeof window === 'undefined') return noop
  active?.destroy()
  if (config.enabled === false) return noop

  if (!customElements.get(HOST_TAG)) customElements.define(HOST_TAG, class extends HTMLElement {})
  const host = document.createElement(HOST_TAG)
  const store = createStore(config.storageKey ?? 'copybara')

  let ui: Ui | undefined
  const editor: Editor = createEditor({
    store,
    ignore: config.ignore,
    isOwn: event => event.composedPath().includes(host),
    onComment: el => ui?.openNote(el),
    onEscape: () => ui?.setMode('off'),
    onUpdate: () => ui?.render(),
  })
  ui = createUi({ host, store, editor: () => editor, config })
  document.body.append(host)
  ui.start()

  const instance: CopybaraInstance = {
    open: ui.open,
    close: ui.close,
    setMode: ui.setMode,
    destroy() {
      ui.destroy()
      editor.destroy()
      store.dispose()
      host.remove()
      if (active === instance) active = null
    },
  }
  active = instance
  return instance
}

/** Removes Copybara from the page and restores the original text. Saved changes are kept. */
export const destroy = () => active?.destroy()
