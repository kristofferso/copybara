# Copybara

Edit the text on your website where it lives, then hand every change to your coding agent as one ready-made prompt.

Reviewing website copy usually means screenshots, spreadsheets and Slack threads. With Copybara, reviewers click the text and change it. Every change lands in one structured list that you hand to an agent.

- **Edit in place.** Turn Copybara on, click a heading, button or paragraph and type. Press Enter to save.
- **Leave notes.** Flag an image, a section or a sentence with a comment.
- **Copy as prompt.** One click gives Claude Code, Cursor or any agent a prompt that says what to change and where to look. A Markdown changelog is one click away too.
- **Coming soon:** send changes straight to a pull request, or as a ticket to Linear or Jira.
- **No dependencies.** About 15 kB gzipped, illustrations included. The UI renders in a shadow root, so it never clashes with your styles.

Changes are stored in the browser's localStorage and survive reloads and navigation. Nothing is sent anywhere.

## Install

```sh
bun add copybara
```

### React, Next.js, Remix

```tsx
import { Copybara } from 'copybara/react'

// e.g. in your root layout
<Copybara enabled={process.env.NODE_ENV !== 'production'} />
```

The component imports the core lazily, so your bundler puts it in a separate chunk. Visitors only download it when `enabled` is true.

### Any site, with a script tag

```html
<script src="https://cdn.jsdelivr.net/npm/copybara/dist/copybara.global.js" data-position="bottom-right"></script>
```

Supported attributes: `data-position`, `data-theme`, `data-instructions`, `data-ignore` and `data-storage-key`. For the full config, set `window.copybaraConfig = { ... }` before the script loads. Add `data-manual` to call `Copybara.init()` yourself.

### Plain JavaScript

```ts
import { init } from 'copybara'

const copybara = init({ position: 'bottom-right' })
// copybara.open(), copybara.setMode('edit' | 'comment' | 'off'), copybara.destroy()
```

## Configuration

```tsx
<Copybara
  instructions="Use sentence case. Never touch legal pages."
  codebase={{
    framework: 'Next.js App Router with next-intl',
    textSources: ['messages/{locale}.json', 'content/**/*.mdx'],
    notes: 'Marketing pages pull copy from Sanity.',
  }}
/>
```

| Option         | Description                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `enabled`      | Render nothing when `false`. Defaults to `true`.                                                 |
| `position`     | `'bottom-left'` (default) or `'bottom-right'`.                                                   |
| `theme`        | `'auto'` (default), `'light'` or `'dark'`.                                                       |
| `instructions` | Extra instructions added to the prompt.                                                          |
| `codebase`     | `framework`, `textSources` and `notes`. Tells the agent where text lives, so it doesn't have to guess. |
| `ignore`       | CSS selector for elements Copybara must never touch. `data-copybara-ignore` always works.         |
| `storageKey`   | localStorage key for saved changes. Defaults to `'copybara'`.                                    |

## Reading and controlling the state

While a tool is on, Copybara sets `data-copybara-mode="edit"` or `"comment"` on `<html>` (and removes it when off). It also fires a `copybara:mode` event on `window`. Use them to style or wire your own buttons:

```ts
const copybara = init()

button.addEventListener('click', () => {
  const on = document.documentElement.hasAttribute('data-copybara-mode')
  on ? copybara.setMode('off') : (copybara.open(), copybara.setMode('edit'))
})

window.addEventListener('copybara:mode', event => console.log(event.detail.mode))
```

```css
html[data-copybara-mode] .edit-hint { display: block; }
```

Give such buttons `data-copybara-ignore` so they keep working while Copybara is on.

## Keyboard

| Key                   | While editing text            |
| --------------------- | ----------------------------- |
| `Enter`               | Save                          |
| `Shift` + `Enter`     | New line                      |
| `Esc`                 | Cancel. Press again to turn Copybara off |
| `⌘`/`Ctrl` + `Enter`  | Save a note                   |

## Exporting from code

```ts
import { toPrompt, toMarkdown } from 'copybara'
```

Both take the stored changes and `{ origin, instructions, codebase }`.

## Try it in a local project before publishing

```sh
# in this repo
bun run build && bun pm pack          # creates copybara-0.1.0.tgz

# in your project
bun add ../path/to/copybara/copybara-0.1.0.tgz
```

A packed tarball installs exactly what npm would, without this repo's dev dependencies. Avoid `bun link` or `npm link` with the React component: the link pulls in a second copy of React and breaks hooks.

## Develop

```sh
bun install
bun run dev        # landing page + playground at http://localhost:3000
bun test
bun run build      # dist/
```

The landing page in `site/` is also the test page. It imports the source directly.

## License

MIT
