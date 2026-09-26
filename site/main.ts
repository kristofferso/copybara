import { init, toMarkdown, toPrompt, type Change, type CopybaraConfig } from '../src/index'
import { playIntro } from './intro'

const REPO = 'kristofferso/copybara'

const config: CopybaraConfig = {
  position: 'bottom-right',
  // Dogfooding: a prompt copied from this page can be pasted straight into an agent working on this repo.
  instructions: 'Keep the plain-spoken tone of the landing page. Avoid em dashes.',
  codebase: {
    framework: 'Static HTML page bundled with Bun',
    textSources: ['site/index.html'],
  },
}

const copybara = init(config)

void playIntro()

// Copybara marks <html data-copybara-mode="edit|comment"> while it is on; the buttons read that.
// Their labels switch in CSS off the same attribute.
document.querySelectorAll('[data-toggle]').forEach(button =>
  button.addEventListener('click', () => {
    if (document.documentElement.hasAttribute('data-copybara-mode')) return copybara.setMode('off')
    copybara.open()
    copybara.setMode('edit')
  }),
)

// Package manager choice, shared by every install command on the page and remembered.
const COMMANDS = { bun: 'bun add copybara', npm: 'npm install copybara', pnpm: 'pnpm add copybara', yarn: 'yarn add copybara' }
type PackageManager = keyof typeof COMMANDS
const PM_KEY = 'copybara-site:pm'
const readPm = (): PackageManager => {
  try {
    const saved = localStorage.getItem(PM_KEY)
    if (saved && saved in COMMANDS) return saved as PackageManager
  } catch {}
  return 'bun'
}
let pm = readPm()

const setPm = (next: PackageManager) => {
  pm = next
  try {
    localStorage.setItem(PM_KEY, pm)
  } catch {}
  document.querySelectorAll('[data-pm-command]').forEach(el => (el.textContent = COMMANDS[pm]))
  // The hero chip reads as one command: the select is the package manager, this is the rest.
  document.querySelectorAll('[data-pm-args]').forEach(el => (el.textContent = COMMANDS[pm].replace(`${pm} `, '')))
  document.querySelectorAll<HTMLElement>('[data-pm]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.pm === pm)))
  document.querySelectorAll<HTMLSelectElement>('[data-pm-select]').forEach(select => (select.value = pm))
}

document.querySelectorAll<HTMLElement>('[data-pm]').forEach(tab => tab.addEventListener('click', () => setPm(tab.dataset.pm as PackageManager)))
document.querySelectorAll<HTMLSelectElement>('[data-pm-select]').forEach(select =>
  select.addEventListener('change', () => setPm(select.value as PackageManager)),
)
document.querySelectorAll<HTMLElement>('[data-copy-install]').forEach(button => {
  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(COMMANDS[pm])
    button.dataset.copied = ''
    setTimeout(() => delete button.dataset.copied, 1400)
  })
})
setPm(pm)

const selectTab = (tabs: NodeListOf<HTMLElement>, active: HTMLElement) =>
  tabs.forEach(tab => tab.setAttribute('aria-selected', String(tab === active)))

// Install tabs
const installTabs = document.querySelectorAll<HTMLElement>('[data-tab]')
installTabs.forEach(tab =>
  tab.addEventListener('click', () => {
    selectTab(installTabs, tab)
    document.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => {
      panel.hidden = panel.dataset.panel !== tab.dataset.tab
    })
  }),
)

// GitHub stars. Stays hidden until the repository exists and the API answers.
fetch(`https://api.github.com/repos/${REPO}`)
  .then(response => (response.ok ? response.json() : null))
  .then(repo => {
    if (typeof repo?.stargazers_count !== 'number') return
    const count = repo.stargazers_count
    document.querySelector('[data-stars]')!.textContent = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
    document.querySelector<HTMLElement>('.stars')!.hidden = false
  })
  .catch(() => {})

// Live preview of the export. Polls storage so it also reflects edits made in other tabs.
const preview = document.querySelector<HTMLElement>('[data-preview]')!
const formatTabs = document.querySelectorAll<HTMLElement>('[data-format]')
const EMPTY = 'Change something on this page and it shows up here.'
let format: 'prompt' | 'markdown' = 'markdown'
let last: string | null = null

const renderPreview = (force = false) => {
  const raw = localStorage.getItem('copybara') ?? ''
  if (raw === last && !force) return
  last = raw
  let changes: Change[] = []
  try {
    changes = JSON.parse(raw || '{}').changes ?? []
  } catch {}
  const options = { origin: location.origin, instructions: config.instructions, codebase: config.codebase }
  preview.textContent = changes.length ? (format === 'prompt' ? toPrompt : toMarkdown)(changes, options) : EMPTY
  preview.toggleAttribute('data-empty', !changes.length)
}

formatTabs.forEach(tab =>
  tab.addEventListener('click', () => {
    format = tab.dataset.format as typeof format
    selectTab(formatTabs, tab)
    renderPreview(true)
  }),
)

renderPreview(true)
setInterval(renderPreview, 600)
