import { beforeEach, expect, test } from 'bun:test'
import { applyHTML, contextFor, describe, hintFor, originFor, readText, resolve, selectorFor, withText } from '../src/anchor'

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
  expect(contextFor(document.querySelectorAll('section')[1]!)).toBe('main, below “Ship copy faster”')
})

test('context falls back to the heading above on pages without landmarks', () => {
  document.body.innerHTML = `<div><h2>Plans</h2><div><div><p>Pay once</p></div></div></div>`
  expect(contextFor(document.querySelector('p')!)).toBe('below “Plans”')
})

test('hints name elements by stable ids, test ids and meaningful classes', () => {
  document.body.innerHTML = `
    <div class="pricing-card flex p-4 css-1q2w3e"><div class="mt-2"><span>Pro</span></div></div>
    <div class="Card_title__x7Yz2">Title</div>
    <button data-testid="buy" class="btn">Buy</button>
    <div id=":r1:"><p>Nothing to go by</p></div>`
  expect(hintFor(document.querySelector('.pricing-card')!)).toBe('div.pricing-card')
  expect(hintFor(document.querySelector('span')!)).toBe('div.pricing-card span')
  expect(hintFor(document.querySelector('[class^="Card_"]')!)).toBe('div.title')
  expect(hintFor(document.querySelector('button')!)).toBe('button[data-testid="buy"]')
  expect(hintFor(document.querySelector('p')!)).toBe('p')
})

test('origin reads the React component and source from development builds', () => {
  document.body.innerHTML = `<div><p>Hi</p></div>`
  const p = document.querySelector('p')! as any
  function PlanCard() {}
  function Pricing() {}
  const pricing = { type: Pricing, return: null }
  const card = { type: PlanCard, return: { type: { displayName: 'ThemeProvider' }, return: pricing } }
  p['__reactFiber$abc'] = {
    type: 'p',
    _debugSource: { fileName: '/Users/me/site/src/components/PlanCard.tsx', lineNumber: 12 },
    return: card,
  }
  expect(originFor(p)).toEqual({ component: 'PlanCard in Pricing', source: 'src/components/PlanCard.tsx:12' })
  expect(originFor(document.querySelector('div')!)).toEqual({})
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

test('withText keeps wrappers around a single run of text', () => {
  expect(withText('<strong>Hello</strong>', 'Hi')).toBe('<strong>Hi</strong>')
  expect(withText('\n  Hello\n', 'Hi')).toBe('\n  Hi\n')
  // Several runs of text or a new line break cannot be mapped safely.
  expect(withText('Pay <strong>once</strong>.', 'Pay twice.')).toBeNull()
  expect(withText('Hello', 'Two\nlines')).toBeNull()
})
