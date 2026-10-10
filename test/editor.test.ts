import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { init } from '../src/index'
import type { CopybaraInstance } from '../src/types'

let copybara: CopybaraInstance

const stored = () => JSON.parse(localStorage.getItem('copybara') ?? '{"changes":[]}').changes
const wait = (ms = 120) => new Promise(resolve => setTimeout(resolve, ms))

beforeEach(() => {
  history.replaceState({}, '', '/pricing')
  localStorage.clear()
  sessionStorage.clear()
  document.title = 'Pricing'
  document.body.innerHTML = `<main><h1>Old headline</h1><a href="/signup">Sign up</a><p data-copybara-ignore>Hands off</p></main>`
  copybara = init()
})

afterEach(() => copybara.destroy())

const editHeadline = (text: string) => {
  const h1 = document.querySelector('h1')!
  h1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  expect(h1.getAttribute('contenteditable')).toBe('true')
  h1.textContent = text
  h1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  return h1
}

test('edit mode turns a click into an inline edit and saves it', () => {
  copybara.setMode('edit')
  const h1 = editHeadline('New headline')
  expect(h1.hasAttribute('contenteditable')).toBe(false)
  const [change] = stored()
  expect(change.page).toEqual({ path: '/pricing', title: 'Pricing' })
  expect(change.target.text).toBe('Old headline')
  expect(change.edit.text).toBe('New headline')
})

test('the mode is exposed as a data attribute and an event', () => {
  const seen: string[] = []
  const listener = (event: Event) => seen.push((event as CustomEvent).detail.mode)
  window.addEventListener('copybara:mode', listener)
  expect(document.documentElement.hasAttribute('data-copybara-mode')).toBe(false)
  copybara.setMode('comment')
  expect(document.documentElement.getAttribute('data-copybara-mode')).toBe('comment')
  copybara.setMode('off')
  expect(document.documentElement.hasAttribute('data-copybara-mode')).toBe(false)
  window.removeEventListener('copybara:mode', listener)
  expect(seen).toEqual(['comment', 'off'])
})

test('clicks on links do not navigate while editing', () => {
  copybara.setMode('edit')
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  document.querySelector('a')!.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
})

test('off leaves the page alone', () => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  document.querySelector('a')!.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
  expect(document.querySelector('a')!.hasAttribute('contenteditable')).toBe(false)
})

test('ignored areas keep working while a tool is on', () => {
  document.querySelector('main')!.insertAdjacentHTML('beforeend', '<div data-copybara-ignore><a href="/docs">Docs</a></div>')
  copybara.setMode('edit')
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  document.querySelector('[data-copybara-ignore] a')!.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
})

test('ignored elements cannot be edited', () => {
  copybara.setMode('edit')
  const p = document.querySelector('p')!
  p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  expect(p.hasAttribute('contenteditable')).toBe(false)
})

test('saved edits come back after a re-render, and reverting restores the original', async () => {
  copybara.setMode('edit')
  editHeadline('New headline')
  copybara.destroy()
  expect(document.querySelector('h1')!.textContent).toBe('Old headline')

  copybara = init()
  await wait()
  expect(document.querySelector('h1')!.textContent).toBe('New headline')

  // The framework re-renders the original text: Copybara puts the edit back.
  document.querySelector('main')!.innerHTML = '<h1>Old headline</h1>'
  await wait()
  expect(document.querySelector('h1')!.textContent).toBe('New headline')

  copybara.setMode('edit')
  editHeadline('Old headline')
  expect(stored()).toHaveLength(0)
})

test('an edit is saved on the page it started on, even after client-side navigation', async () => {
  copybara.setMode('edit')
  const h1 = document.querySelector('h1')!
  h1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  h1.textContent = 'New headline'
  // The reviewer follows a link before pressing Enter.
  history.pushState({}, '', '/about')
  window.dispatchEvent(new PopStateEvent('popstate'))
  await wait()
  expect(stored()[0].page.path).toBe('/pricing')
})

test('init({ enabled: false }) removes a running instance', () => {
  expect(document.querySelector('copybara-ui')).not.toBeNull()
  init({ enabled: false })
  expect(document.querySelector('copybara-ui')).toBeNull()
  copybara = init()
})

describe('editing in the panel', () => {
  const panel = () => document.querySelector('copybara-ui')!.shadowRoot!

  const typeInPanel = (value: string) => {
    const field = panel().querySelector<HTMLTextAreaElement>('textarea.edit-text')!
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
    return field
  }

  beforeEach(async () => {
    copybara.destroy()
    localStorage.clear()
    document.body.innerHTML = '<main><p><strong>Hello</strong></p></main>'
    copybara = init()
    copybara.setMode('edit')
    const strong = document.querySelector('strong')!
    strong.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    strong.textContent = 'Hello!'
    strong.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    copybara.open()
    panel().querySelector<HTMLButtonElement>('button.diff')!.click()
  })

  test('keeps the change while the text briefly matches the original', () => {
    typeInPanel('Hello')
    expect(stored()).toHaveLength(1)
    typeInPanel('Hello?')
    expect(stored()[0].edit.text).toBe('Hello?')
  })

  test('drops the change on blur when it ends up unchanged', () => {
    const field = typeInPanel('Hello')
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(stored()).toHaveLength(0)
  })

  test('keeps the markup of the page element', async () => {
    // A button with a text label and an icon next to it.
    copybara.destroy()
    localStorage.clear()
    document.body.innerHTML = '<main><button>Save<img src="/icon.png" alt=""></button></main>'
    copybara = init()
    copybara.setMode('edit')
    const button = document.querySelector('button')!
    const icon = button.querySelector('img')
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    button.firstChild!.textContent = 'Save it'
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    copybara.open()
    panel().querySelector<HTMLButtonElement>('button.diff')!.click()

    typeInPanel('Save now')
    await wait()
    expect(button.querySelector('img')).toBe(icon)
    expect(button.textContent).toBe('Save now')
  })
})

describe('turning on and off', () => {
  const mode = () => document.documentElement.getAttribute('data-copybara-mode')
  const launcher = () => document.querySelector('copybara-ui')!.shadowRoot!.querySelector<HTMLButtonElement>('.launcher')!
  const press = (init: KeyboardEventInit) =>
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))

  test('the shortcut toggles the last tool used', () => {
    copybara.setMode('comment')
    press({ key: 'ç', code: 'KeyC', altKey: true })
    expect(mode()).toBeNull()
    press({ key: 'ç', code: 'KeyC', altKey: true })
    expect(mode()).toBe('comment')
  })

  test('the shortcut can be changed or turned off', () => {
    copybara.destroy()
    copybara = init({ shortcut: 'ctrl+shift+e' })
    press({ key: 'c', code: 'KeyC', altKey: true })
    expect(mode()).toBeNull()
    press({ key: 'E', code: 'KeyE', ctrlKey: true, shiftKey: true })
    expect(mode()).toBe('edit')
    copybara.setMode('off')
    copybara.destroy()
    copybara = init({ shortcut: false })
    press({ key: 'c', code: 'KeyC', altKey: true })
    expect(mode()).toBeNull()
  })

  test('double-clicking the launcher toggles without opening the panel', async () => {
    launcher().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    launcher().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }))
    launcher().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }))
    await wait(300)
    expect(mode()).toBe('edit')
    expect(launcher().getAttribute('aria-expanded')).toBe('false')
  })

  test('dragging the launcher snaps it to the nearest corner and remembers it', () => {
    const pointer = (type: string, x: number, y: number) =>
      new PointerEvent(type, { bubbles: true, composed: true, pointerId: 1, button: 0, clientX: x, clientY: y })
    launcher().dispatchEvent(pointer('pointerdown', 40, innerHeight - 40))
    launcher().dispatchEvent(pointer('pointermove', innerWidth - 60, 50))
    launcher().dispatchEvent(pointer('pointerup', innerWidth - 60, 50))
    const root = () => document.querySelector('copybara-ui')!.shadowRoot!.querySelector<HTMLElement>('.root')!
    expect(root().dataset.pos).toBe('top-right')
    copybara.destroy()
    copybara = init()
    expect(root().dataset.pos).toBe('top-right')
  })

  test('clicking the active tool turns Copybara off', () => {
    copybara.open()
    const tool = () => document.querySelector('copybara-ui')!.shadowRoot!.querySelector<HTMLButtonElement>('.tool[data-tool="comment"]')!
    tool().click()
    expect(mode()).toBe('comment')
    tool().click()
    expect(mode()).toBeNull()
  })

  test('a single click opens the panel', async () => {
    launcher().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    await wait(300)
    expect(launcher().getAttribute('aria-expanded')).toBe('true')
    expect(mode()).toBeNull()
  })
})

test('focus and clicks in the UI stay hidden from focus traps on the page', () => {
  const seen: string[] = []
  const record = (event: Event) => seen.push(event.type)
  for (const type of ['focusin', 'pointerdown', 'mousedown']) document.addEventListener(type, record, true)
  copybara.setMode('comment')
  document.querySelector('h1')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  const field = document.querySelector('copybara-ui')!.shadowRoot!.querySelector('.popover textarea')!
  field.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
  field.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
  field.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }))
  for (const type of ['focusin', 'pointerdown', 'mousedown']) document.removeEventListener(type, record, true)
  expect(seen).toEqual([])
})
