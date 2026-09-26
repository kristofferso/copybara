import { animate } from 'motion'

declare global {
  interface Window {
    __introFallback?: ReturnType<typeof setTimeout>
  }
}

const FINAL = 'right where it is.'
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Draws each path of an SVG in turn, like a pen stroke. */
const draw = async (svg: Element | null, duration: number) => {
  if (!svg) return
  const paths = [...svg.querySelectorAll('path')]
  paths.forEach(path => animate(path, { pathLength: 0 }, { duration: 0 }))
  ;(svg as SVGElement).style.visibility = 'visible'
  for (const path of paths) {
    await animate(path, { pathLength: [0, 1] }, { duration: duration / paths.length, ease: 'easeInOut' })
  }
}

/** Reveals text left to right, like it is being written. */
const write = (el: HTMLElement, duration: number) => {
  el.style.clipPath = 'inset(-20% 100% -20% 0)'
  el.style.opacity = '1'
  return animate(el, { clipPath: 'inset(-20% 0% -20% 0)' }, { duration, ease: 'easeInOut' }).then(() => {
    el.style.clipPath = ''
  })
}

const reveal = (el: HTMLElement, delay = 0) =>
  animate(el, { opacity: [0, 1], y: [4, 0] }, { duration: 0.4, delay }).then(() => {})

/**
 * Hero intro: a "Copybara" cursor selects the italic part of the headline and rewrites it. The
 * notebook follows along: the selection shows the current text, typing writes the new text, and
 * a note comes last. The inline script in index.html sets up the starting state.
 */
export const playIntro = async () => {
  const root = document.documentElement
  if (!root.classList.contains('intro')) return
  clearTimeout(window.__introFallback)

  const em = document.querySelector<HTMLElement>('.hero h1 em')!
  const notebook = document.querySelector<HTMLElement>('.notebook')!
  const steps = [...notebook.querySelectorAll<HTMLElement>('[data-step]')]
  const [head, line, old, next, note] = steps as [HTMLElement, HTMLElement, HTMLElement, HTMLElement, HTMLElement]
  const written = next.firstChild as Text

  const cursor = document.createElement('div')
  cursor.className = 'ghost-cursor'
  cursor.setAttribute('aria-hidden', 'true')
  cursor.setAttribute('data-copybara-ignore', '')
  cursor.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 3l6.5 17 2.4-7.1L20 10.5z" fill="#e5482a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="ghost-label">Copybara</span>`
  document.body.append(cursor)

  const at = (x: 'left' | 'right') => {
    const range = document.createRange()
    range.selectNodeContents(em)
    const rects = [...range.getClientRects()]
    const r = (x === 'left' ? rects[0] : rects[rects.length - 1])!
    return { x: (x === 'left' ? r.left : r.right) + scrollX, y: r.top + r.height * 0.6 + scrollY }
  }
  const moveTo = (to: { x: number; y: number }, duration: number) =>
    animate(cursor, { x: to.x, y: to.y }, { duration, ease: [0.45, 0, 0.2, 1] })

  // 1. The cursor appears just below the phrase and settles on its first letter.
  const start = at('left')
  cursor.style.transform = `translate(${start.x + 40}px, ${start.y + 70}px)`
  await sleep(600)
  animate(cursor, { opacity: 1 }, { duration: 0.3 })
  await moveTo(start, 0.7)
  await sleep(200)

  // 2. Drag-select with a real text selection. The notebook shows what is there today.
  reveal(head)
  reveal(line, 0.15)
  reveal(old, 0.3)
  const text = em.firstChild as Text
  const range = document.createRange()
  range.setStart(text, 0)
  const selection = getSelection()!
  const drag = moveTo(at('right'), 0.8)
  for (let i = 1; i <= text.length; i++) {
    range.setEnd(text, i)
    selection.removeAllRanges()
    selection.addRange(range)
    await sleep(800 / text.length)
  }
  await drag
  await sleep(350)

  // 3. Typing replaces the selection: the old line is struck out and the new one is written
  // into the notebook letter by letter, in step with the headline.
  selection.removeAllRanges()
  const caret = document.createElement('span')
  caret.className = 'type-caret'
  em.replaceChildren('', caret)
  draw(old.querySelector('.strike'), 0.35)
  written.data = ''
  next.style.opacity = '1'
  for (let i = 1; i <= FINAL.length; i++) {
    em.firstChild!.textContent = FINAL.slice(0, i)
    written.data = FINAL.slice(0, i)
    await sleep(FINAL[i - 1] === ' ' ? 180 : 95 + Math.random() * 70)
  }
  await sleep(300)
  em.replaceChildren(FINAL)
  written.data = FINAL
  draw(next.querySelector('.tick'), 0.35)

  // 4. The cursor drifts off. Last, the reviewer's note.
  const end = at('right')
  moveTo({ x: end.x + 30, y: end.y + 40 }, 0.8)
  animate(cursor, { opacity: 0 }, { duration: 0.6, delay: 0.2 }).then(() => cursor.remove())
  await sleep(500)
  // The note is handwritten: the text is written out, then the arrow is drawn.
  const arrow = note.querySelector('.note-arrow')
  await write(note, 0.9)
  await draw(arrow, 0.5)

  root.classList.remove('intro')
  steps.forEach(el => el.removeAttribute('style'))
}
