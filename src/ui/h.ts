type Child = Node | string | false | null | undefined
type Props = Record<string, unknown>

/** Tiny element factory: `on*` props become listeners, `value` and booleans are set as properties. */
export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener)
    } else if (key === 'class') {
      el.className = String(value)
    } else if (key === 'value') {
      ;(el as HTMLTextAreaElement).value = String(value)
    } else if (key === 'style') {
      el.style.cssText = String(value)
    } else {
      el.setAttribute(key, value === true ? '' : String(value))
    }
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined && child !== false) el.append(child)
  }
  return el
}
