// Bumps the version, pushes it, publishes to npm and creates the GitHub release.
// Usage: bun run release [patch | minor | major | <version>]
import { $ } from 'bun'

const bump = process.argv[2] ?? 'patch'

if ((await $`git status --porcelain`.text()).trim()) throw new Error('Commit or stash your changes first.')
if ((await $`git branch --show-current`.text()).trim() !== 'main') throw new Error('Release from main.')

await $`bun pm version ${bump}`
const { version } = await Bun.file('package.json').json()

await $`git push --follow-tags`
// prepublishOnly runs typecheck, tests and the build.
await $`bun publish`
await $`gh release create v${version} --title ${version} --generate-notes --verify-tag`
