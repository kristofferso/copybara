import { $ } from 'bun'
import { rm } from 'node:fs/promises'

await rm('dist', { recursive: true, force: true })

const shared = {
  target: 'browser',
  minify: true,
  sourcemap: 'linked',
  // Inline the illustrations so the package has no runtime asset requests.
  loader: { '.webp': 'dataurl' as Bun.Loader },
} as const

const results = await Promise.all([
  // ESM for bundlers.
  Bun.build({ ...shared, entrypoints: ['src/index.ts'], outdir: 'dist', format: 'esm' }),
  // Self-contained file for a <script> tag.
  Bun.build({
    ...shared,
    entrypoints: ['src/global.ts'],
    outdir: 'dist',
    format: 'iife',
    naming: 'copybara.global.js',
  }),
])

for (const result of results) {
  if (!result.success) {
    console.error(result.logs)
    process.exit(1)
  }
}

// The React wrapper is transpiled, not bundled: `import('./index.js')` must stay as written so the
// app's bundler splits the core into its own chunk, fetched only when <Copybara /> is enabled.
// Transpiling also keeps the "use client" directive that Next.js needs.
const react = new Bun.Transpiler({ loader: 'ts', target: 'browser' }).transformSync(await Bun.file('src/react.ts').text())
await Bun.write('dist/react.js', react)

await $`tsc -p tsconfig.build.json`

const outputs = [...results.flatMap(r => r.outputs).filter(o => o.kind !== 'sourcemap'), Bun.file('dist/react.js')]
for (const output of outputs) {
  const gzip = Bun.gzipSync(await output.arrayBuffer()).length
  const path = 'path' in output ? output.path : output.name!
  console.log(`${path.replace(process.cwd() + '/', '').padEnd(34)} ${(output.size / 1024).toFixed(1).padStart(6)} kB  (${(gzip / 1024).toFixed(1)} kB gzip)`)
}
