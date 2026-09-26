import { expect, test } from 'bun:test'
import { groupByPage, toMarkdown, toPrompt } from '../src/export'
import type { Change } from '../src/types'

const change = (overrides: Partial<Change>): Change => ({
  id: Math.random().toString(36),
  page: { path: '/', title: 'Home', lang: 'en' },
  target: { selector: 'h1', tag: 'h1', text: 'Ship copy faster', context: 'section “Hero”' },
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})

const changes = [
  change({ edit: { text: 'Ship copy today', html: '', originalHTML: '' } }),
  change({
    page: { path: '/about', title: 'About' },
    target: { selector: 'img', tag: 'img', text: '', src: 'https://example.com/team.jpg', label: 'Team' },
    comment: 'Use the new team photo',
  }),
  change({ comment: 'Too long?', target: { selector: 'p', tag: 'p', text: 'We ```really``` care' } }),
]

test('groups by page with the current page first', () => {
  const groups = groupByPage(changes, '/about')
  expect(groups.map(g => g.page.path)).toEqual(['/about', '/'])
  expect(groups[1]!.changes).toHaveLength(2)
})

test('prompt includes instructions, codebase intel and every change', () => {
  const prompt = toPrompt(changes, {
    origin: 'https://example.com',
    instructions: 'Use sentence case.',
    codebase: { framework: 'Next.js', textSources: ['messages/{locale}.json'], notes: 'Marketing copy lives in Sanity.' },
  })
  expect(prompt).toContain('at https://example.com')
  expect(prompt).not.toMatch(/\n\n\n/)
  expect(prompt).toContain('1 text change and 2 notes across 2 pages')
  expect(prompt).toContain('## About this codebase')
  expect(prompt).toContain('`messages/{locale}.json`')
  expect(prompt).toContain('Use sentence case.')
  expect(prompt).toContain('### Home (`/`, lang `en`)')
  expect(prompt).not.toContain('—')
  expect(prompt).toContain('Original text:\n```text\nShip copy faster\n```')
  expect(prompt).toContain('New text:\n```text\nShip copy today\n```')
  expect(prompt).toContain('Media: https://example.com/team.jpg')
  expect(prompt).toContain('> Use the new team photo')
  // Text containing backticks gets a longer fence.
  expect(prompt).toContain('````text\nWe ```really``` care\n````')
})

test('notes on big containers only carry an excerpt', () => {
  const prompt = toPrompt([change({ comment: 'Too busy', target: { selector: 'section', tag: 'section', text: 'Lorem ipsum. '.repeat(40) } })])
  expect(prompt).toContain('Text (excerpt):')
  expect(prompt.length).toBeLessThan(3000)
})

test('prompt leaves out empty optional sections', () => {
  const prompt = toPrompt([changes[0]!])
  expect(prompt).not.toContain('About this codebase')
  expect(prompt).not.toContain('Project instructions')
})

test('markdown shows an inline word diff', () => {
  const md = toMarkdown([changes[0]!])
  expect(md).toContain('Ship copy ~~faster~~ **today**')
})
