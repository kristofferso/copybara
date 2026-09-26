const LIGHT = `
  --bg: #fffdf9;
  --bg-2: #f5f0e8;
  --bg-3: #ebe4d8;
  --line: #e9e2d6;
  --line-2: #d9d0c2;
  --ink: #1f1b16;
  --muted: #6f675d;
  --faint: #a69d91;
  --accent: #e5482a;
  --accent-ink: #c43a1c;
  --accent-soft: #fce9e4;
  --on-ink: #ffffff;
  --del: #c62d2d;
  --del-bg: #fdecec;
  --ins: #17803d;
  --ins-bg: #e8f7ee;
  --note: #2f63d8;
  --note-bg: #edf2fd;
  --shadow: 0 18px 48px -16px rgb(60 40 20 / .25), 0 2px 6px rgb(60 40 20 / .06);
`

const DARK = `
  --bg: #1e1b18;
  --bg-2: #28241f;
  --bg-3: #332e28;
  --line: #36302a;
  --line-2: #443c34;
  --ink: #f4efe7;
  --muted: #aba194;
  --faint: #756c61;
  --accent: #ff6a4a;
  --accent-ink: #ff9a7e;
  --accent-soft: #3d201a;
  --on-ink: #1f1b16;
  --del: #ff8c85;
  --del-bg: #43211f;
  --ins: #6fd49a;
  --ins-bg: #173325;
  --note: #8eb0ff;
  --note-bg: #1c2742;
  --shadow: 0 18px 48px -16px rgb(0 0 0 / .7), 0 0 0 1px rgb(255 255 255 / .06);
`

export const css: string = `
:host { all: initial; }

.root {
  ${LIGHT}
  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --ease: cubic-bezier(.2, .9, .25, 1);
  position: fixed;
  bottom: 16px;
  left: 16px;
  z-index: 2147483600;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  font: 13.5px/1.45 var(--sans);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  text-align: left;
  letter-spacing: normal;
}
.root[data-pos="bottom-right"] { left: auto; right: 16px; align-items: flex-end; }
.root[data-theme="dark"] { ${DARK} }
@media (prefers-color-scheme: dark) { .root[data-theme="auto"] { ${DARK} } }

*, *::before, *::after { box-sizing: border-box; }
button, textarea { font: inherit; color: inherit; }
button { cursor: pointer; border: 0; background: none; padding: 0; }
button:disabled { cursor: not-allowed; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
code { font-family: var(--mono); }

.icon { display: inline-flex; width: 16px; height: 16px; flex: none; }
.icon svg { width: 100%; height: 100%; }

.avatar {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent-soft) center / cover no-repeat;
}

/* Launcher */
.launcher {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px 0 6px;
  border-radius: 999px;
  background: var(--bg);
  box-shadow: var(--shadow), 0 0 0 1px var(--line);
  font-weight: 600;
  font-size: 13.5px;
  transition: transform .15s var(--ease);
}
.launcher:hover { transform: translateY(-1px); }
.launcher:active { transform: none; }
.live {
  --pulse: var(--accent);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pulse);
  animation: live 1.8s infinite;
}
.launcher[data-mode="comment"] .live { --pulse: var(--note); }
@keyframes live {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--pulse) 50%, transparent); }
  70%, 100% { box-shadow: 0 0 0 6px transparent; }
}
.badge {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--bg-3);
  color: var(--ink);
  font: 600 11.5px/20px var(--sans);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* Panel */
.panel {
  width: 392px;
  max-width: calc(100vw - 32px);
  max-height: min(680px, calc(100vh - 88px));
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: var(--bg);
  box-shadow: var(--shadow), 0 0 0 1px var(--line);
  overflow: hidden;
  transform-origin: bottom left;
  transition: opacity .16s, transform .2s var(--ease), visibility 0s;
}
.root[data-pos="bottom-right"] .panel { transform-origin: bottom right; }
.panel:not([data-open]) {
  opacity: 0;
  visibility: hidden;
  transform: translateY(8px) scale(.97);
  transition: opacity .12s, transform .12s, visibility 0s .12s;
  pointer-events: none;
}

.head { display: flex; align-items: center; gap: 10px; padding: 14px 10px 12px 14px; }
.brand { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.wordmark { font: italic 500 18px/1.15 var(--serif); }
.meta { color: var(--muted); font-size: 12px; }

.switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 10px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--muted);
}
.switch:hover { background: var(--bg-2); }
.switch[aria-checked="true"] { color: var(--accent-ink); }
.track { position: relative; width: 34px; height: 20px; border-radius: 999px; background: var(--line-2); transition: background .18s; }
.track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform .2s var(--ease);
}
.switch[aria-checked="true"] .track { background: var(--accent); }
.switch[aria-checked="true"] .track::after { transform: translateX(14px); }

.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: var(--muted);
}
.icon-btn:hover { background: var(--bg-2); color: var(--ink); }

.tools { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 0 14px; }
.tool {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--bg-2);
  color: var(--muted);
  font-weight: 550;
  transition: background .15s, color .15s, box-shadow .15s;
}
.tool:hover { color: var(--ink); background: var(--bg-3); }
.tool[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent-ink); box-shadow: inset 0 0 0 1.5px var(--accent); }
.tool[data-tool="comment"][aria-pressed="true"] { background: var(--note-bg); color: var(--note); box-shadow: inset 0 0 0 1.5px var(--note); }

.hint { margin: 10px 16px 12px; color: var(--muted); font-size: 12.5px; }
kbd {
  display: inline-block;
  padding: 0 5px;
  border-radius: 5px;
  background: var(--bg);
  box-shadow: 0 0 0 1px var(--line-2);
  font: 500 11px/17px var(--sans);
  color: var(--ink);
}

.list {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 14px 14px;
  border-top: 1px solid var(--line);
  scrollbar-width: thin;
  scrollbar-color: var(--line-2) transparent;
}
.group { margin-top: 10px; }
.group > summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 2px 8px;
  list-style: none;
  cursor: pointer;
  user-select: none;
}
.group > summary::-webkit-details-marker { display: none; }
.group > summary::before {
  content: "";
  align-self: center;
  width: 5px;
  height: 5px;
  border-right: 1.5px solid var(--faint);
  border-bottom: 1.5px solid var(--faint);
  transform: rotate(-45deg);
  transition: transform .15s;
}
.group[open] > summary::before { transform: rotate(45deg) translate(-1px, -1px); }
.page-title { font-weight: 600; font-size: 12.5px; }
.page-path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); font: 11.5px var(--mono); }
.count { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.go { display: inline-flex; align-items: center; gap: 4px; margin: 0 2px 8px; color: var(--accent-ink); font-size: 12px; font-weight: 550; text-decoration: none; }
.go:hover { text-decoration: underline; }
.go .icon { width: 13px; height: 13px; }

.cards { display: flex; flex-direction: column; gap: 8px; }
.card {
  padding: 8px 8px 10px 12px;
  border-radius: 12px;
  background: var(--bg);
  box-shadow: 0 0 0 1px var(--line);
  animation: card-in .2s var(--ease);
}
@keyframes card-in { from { opacity: 0; transform: translateY(3px); } }
.card-top { display: flex; align-items: center; gap: 7px; min-height: 26px; }
.kind { display: inline-flex; color: var(--accent); }
.kind .icon { width: 14px; height: 14px; }
.card[data-kind="note"] .kind { color: var(--note); }
.where { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
.where code { color: var(--ink); font-size: 11.5px; }
.actions { display: flex; opacity: 0; transition: opacity .12s; }
.card:hover .actions, .card:focus-within .actions { opacity: 1; }
@media (hover: none) { .actions { opacity: 1; } }
.actions .icon-btn { width: 26px; height: 26px; }

.diff {
  display: block;
  width: calc(100% + 8px);
  margin: 4px 0 0 -6px;
  padding: 5px 6px;
  border-radius: 8px;
  font: 15px/1.5 var(--serif);
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.diff:hover { background: var(--bg-2); }
.del { color: var(--del); background: var(--del-bg); text-decoration: line-through; border-radius: 3px; padding: 0 1px; }
.ins { color: var(--ins); background: var(--ins-bg); border-radius: 3px; padding: 0 1px; }
.del + .ins { margin-left: 2px; }
.quote {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.thumb { display: block; max-width: 100%; max-height: 100px; margin-top: 6px; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); }

textarea {
  display: block;
  width: 100%;
  min-height: 56px;
  margin-top: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: var(--bg-2);
  resize: vertical;
  font-size: 13.5px;
  line-height: 1.45;
  field-sizing: content;
  max-height: 240px;
}
textarea.edit-text { font: 15px/1.5 var(--serif); }
textarea:focus { outline: none; box-shadow: inset 0 0 0 1.5px var(--accent); background: var(--bg); }
textarea.note { background: var(--note-bg); }
textarea.note:focus { box-shadow: inset 0 0 0 1.5px var(--note); }
textarea::placeholder { color: var(--faint); }
.add-note { margin-top: 4px; padding: 2px 0; color: var(--faint); font-size: 12px; }
.add-note:hover { color: var(--note); }
.clear { display: block; margin: 14px auto 0; padding: 4px 8px; border-radius: 6px; color: var(--faint); font-size: 12px; }
.clear:hover { color: var(--ink); background: var(--bg-2); }
.clear.danger { color: var(--del); background: var(--del-bg); font-weight: 600; }

.empty { display: flex; align-items: flex-end; gap: 8px; padding: 16px 4px 0; }
.empty-text { flex: 1; padding-bottom: 20px; }
.empty-title { margin: 0 0 4px; font: italic 500 19px/1.2 var(--serif); }
.empty-text p { margin: 0; color: var(--muted); }
.empty-text .btn { margin-top: 12px; }
.empty-art { width: 92px; margin-bottom: -16px; transform: scaleX(-1); }

/* Footer */
.foot { padding: 12px 14px; border-top: 1px solid var(--line); }
.export { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  background: var(--bg);
  box-shadow: inset 0 0 0 1px var(--line-2);
  font-weight: 550;
  transition: background .12s, opacity .12s;
}
.btn:not(:disabled):hover { background: var(--bg-2); }
.btn:disabled { opacity: .45; }
.btn.primary { background: var(--ink); color: var(--on-ink); box-shadow: none; }
.btn.primary:not(:disabled):hover { background: color-mix(in srgb, var(--ink) 85%, var(--bg)); }

.send { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; color: var(--faint); font-size: 12px; }
.dest {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
}
.dest .icon { width: 13px; height: 13px; }
.soon {
  margin-left: auto;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
  line-height: 18px;
}

/* Note popover */
.popover {
  position: fixed;
  width: 320px;
  max-width: calc(100vw - 24px);
  padding: 12px;
  border-radius: 14px;
  background: var(--bg);
  box-shadow: var(--shadow), 0 0 0 1px var(--line);
  animation: pop-in .16s var(--ease);
}
.popover[hidden] { display: none; }
@keyframes pop-in { from { opacity: 0; transform: translateY(4px); } }
.pop-head { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12.5px; }
.pop-head > .icon { color: var(--note); width: 14px; height: 14px; }
.popover textarea { min-height: 72px; }
.pop-actions { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
.pop-actions .kbd-hint { flex: 1; color: var(--faint); font-size: 11.5px; }
.pop-actions .btn { height: 32px; padding: 0 12px; font-size: 13px; }
.popover .btn.primary { background: var(--note); color: #fff; }

/* Toast */
.toast {
  position: fixed;
  bottom: 72px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px 10px 10px;
  border-radius: 14px;
  background: var(--bg);
  box-shadow: var(--shadow), 0 0 0 1px var(--line);
  transform: translate(-50%, 12px);
  opacity: 0;
  visibility: hidden;
  transition: opacity .16s, transform .25s var(--ease), visibility 0s .25s;
  pointer-events: none;
}
.toast[data-show] { opacity: 1; visibility: visible; transform: translate(-50%, 0); transition: opacity .16s, transform .3s var(--ease); }
.toast img { width: 52px; height: 58px; object-fit: contain; object-position: bottom; margin: -22px 0 -4px; transform: rotate(-6deg); }
.toast[data-show] img { animation: hop .6s var(--ease) .05s; }
@keyframes hop { 30% { transform: translateY(-8px) rotate(-10deg); } 60% { transform: translateY(0) rotate(-4deg); } }
.toast strong { display: block; font: italic 500 17px/1.2 var(--serif); }
.toast span { color: var(--muted); font-size: 12.5px; }

@media (max-width: 480px) {
  .root { left: 12px; right: 12px; bottom: 12px; }
  .panel { width: 100%; max-width: none; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`
