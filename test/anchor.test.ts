import { beforeEach, expect, test } from 'bun:test'
import { applyHTML, contextFor, describe, readText, resolve, selectorFor } from '../src/anchor'

beforeEach(() => {
  document.body.innerHTML = `
    <main>
      <section aria-label="Hero"><h1 style="text-transform: uppercase">Ship  copy
        faster</h1></section>
      <section>
        <h2>Pricing</h2>
        <p>Pay <strong>once</strong>.<br>Use forever.</p>
        <p>Pay <strong>once</strong>.<br>Use forever.</p>
        <img src="/cat.png" alt="A cat">
      </section>
    </main>`
})

test('readText collapses source whitespace but keeps line breaks and case', () => {
  expect(readText(document.querySelector('h1')!)).toBe('Ship copy faster')
  expect(readText(document.querySelector('p')!)).toBe('Pay once.\nUse forever.')
})

test('selectors tell identical siblings apart', () => {
  const [, second] = document.querySelectorAll('p')
  const selector = selectorFor(second!)
  expect(selector).toContain('p:nth-of-type(2)')
  expect(document.querySelector(selector)).toBe(second!)
})

test('context names the landmark by label or the heading before the element', () => {
  expect(contextFor(document.querySelector('h1')!)).toBe('section “Hero”')
  expect(contextFor(document.querySelector('p')!)).toBe('section “Pricing”')
  // Headings inside other sections do not name <main>.
  expect(contextFor(document.querySelector('section')!)).toBe('main')
  expect(contextFor(document.querySelectorAll('section')[1]!)).toBe('main')
})

test('describe names sections by their own heading', () => {
  const section = document.querySelectorAll('section')[1]!
  expect(describe(section).label).toBe('Pricing')
})

test('describe records media source and alt', () => {
  const target = describe(document.querySelector('img')!)
  expect(target.tag).toBe('img')
  expect(target.src).toBe('https://example.com/cat.png')
  expect(target.label).toBe('A cat')
})

test('resolve falls back to text when the selector goes stale', () => {
  const target = describe(document.querySelector('h1')!)
  document.querySelector('main')!.prepend(document.createElement('header'))
  target.selector = 'main > div:nth-of-type(9)'
  expect(resolve(target, [target.text])).toBe(document.querySelector('h1'))
})

test('applyHTML keeps existing text nodes when the structure matches', () => {
  const p = document.querySelector('p')!
  const strong = p.querySelector('strong')!
  applyHTML(p, 'Pay <strong>twice</strong>.<br>Use forever.')
  expect(p.querySelector('strong')).toBe(strong)
  expect(readText(p)).toBe('Pay twice.\nUse forever.')
})
