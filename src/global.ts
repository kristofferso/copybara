// Entry for <script src=".../copybara.global.js">. Configure with data-* attributes on the tag,
// or with `window.copybaraConfig = {...}` set before the script loads.
import { destroy, init, toMarkdown, toPrompt } from './index'
import type { CopybaraConfig } from './types'

declare global {
  interface Window {
    copybaraConfig?: CopybaraConfig
    Copybara?: { init: typeof init; destroy: typeof destroy; toPrompt: typeof toPrompt; toMarkdown: typeof toMarkdown }
  }
}

const script = document.currentScript as HTMLScriptElement | null
const data = script?.dataset ?? {}

const fromAttributes: CopybaraConfig = {}
if (data.position) fromAttributes.position = data.position as CopybaraConfig['position']
if (data.theme) fromAttributes.theme = data.theme as CopybaraConfig['theme']
if (data.instructions) fromAttributes.instructions = data.instructions
if (data.ignore) fromAttributes.ignore = data.ignore
if (data.storageKey) fromAttributes.storageKey = data.storageKey

window.Copybara = { init, destroy, toPrompt, toMarkdown }

// Add `data-manual` to the tag to call Copybara.init() yourself.
if (!('manual' in data)) {
  const start = () => init({ ...window.copybaraConfig, ...fromAttributes })
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
}
