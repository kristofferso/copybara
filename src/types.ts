export type CopybaraConfig = {
  /** Set to false to render nothing. Defaults to true. */
  enabled?: boolean
  /** Corner for the launcher button. Defaults to 'bottom-left'. */
  position?: 'bottom-left' | 'bottom-right'
  /** Defaults to 'auto', which follows the visitor's system setting. */
  theme?: 'auto' | 'light' | 'dark'
  /** Extra instructions added to the generated prompt, e.g. team conventions. */
  instructions?: string
  /** What the agent should know about where text lives in your codebase. */
  codebase?: CodebaseIntel
  /** CSS selector for elements Copybara must never touch. `[data-copybara-ignore]` always applies. */
  ignore?: string
  /** localStorage key for saved changes. Defaults to 'copybara'. */
  storageKey?: string
}

export type CodebaseIntel = {
  /** e.g. 'Next.js App Router with next-intl' */
  framework?: string
  /** Where copy is defined, e.g. ['messages/{locale}.json', 'src/content/**\/*.mdx'] */
  textSources?: string[]
  /** Anything else worth knowing, in plain words. */
  notes?: string
}

/** 'off' leaves the page alone; the other two are Copybara's tools. */
export type Mode = 'off' | 'edit' | 'comment'

export type Page = {
  path: string
  title: string
  lang?: string
}

/** How we find an element again, and how we describe it to a human or an agent. */
export type Target = {
  selector: string
  tag: string
  /** Text as it was before any edits, whitespace-normalised. */
  text: string
  /** Nearest meaningful heading or landmark, e.g. 'section “Pricing”'. */
  context?: string
  /** For images and video. */
  src?: string
  /** Human name for the element: alt text, aria-label, or a section's own heading. */
  label?: string
}

export type TextEdit = {
  text: string
  html: string
  originalHTML: string
}

/** One entry per element: an optional text edit and an optional note. */
export type Change = {
  id: string
  page: Page
  target: Target
  edit?: TextEdit
  comment?: string
  createdAt: number
  updatedAt: number
}

export type CopybaraInstance = {
  open(): void
  close(): void
  setMode(mode: Mode): void
  destroy(): void
}
