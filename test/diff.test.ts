import { expect, test } from 'bun:test'
import { diffWords } from '../src/diff'

test('marks replaced words', () => {
  expect(diffWords('Start your free trial', 'Start your trial today')).toEqual([
    { type: 'same', value: 'Start your ' },
    { type: 'del', value: 'free ' },
    { type: 'same', value: 'trial' },
    { type: 'ins', value: ' today' },
  ])
})

test('identical text is one part', () => {
  expect(diffWords('Hello there', 'Hello there')).toEqual([{ type: 'same', value: 'Hello there' }])
})

test('handles empty sides', () => {
  expect(diffWords('', 'New')).toEqual([{ type: 'ins', value: 'New' }])
  expect(diffWords('Old', '')).toEqual([{ type: 'del', value: 'Old' }])
})
