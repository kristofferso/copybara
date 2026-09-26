import { afterEach, beforeEach, expect, test } from 'bun:test'
import { init } from '../src/index'
import type { CopybaraInstance } from '../src/types'

let copybara: CopybaraInstance

const stored = () => JSON.parse(localStorage.getItem('copybara') ?? '{"changes":[]}').changes
const wait = (ms = 120) => new Promise(resolve => setTimeout(resolve, ms))

beforeEach(() => {
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
