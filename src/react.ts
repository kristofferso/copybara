'use client'

import { useEffect } from 'react'
import type { CopybaraConfig } from './types.js'

export type CopybaraProps = CopybaraConfig

/**
 * Renders nothing itself; mounts Copybara next to your app. The core is loaded with a dynamic
 * import, so bundlers split it out and visitors only download it when `enabled` is true.
 */
export const Copybara = ({ enabled = true, ...config }: CopybaraProps) => {
  const key = JSON.stringify(config)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let destroy: (() => void) | undefined
    import('./index.js').then(({ init }) => {
      if (!cancelled) destroy = init(JSON.parse(key)).destroy
    })
    return () => {
      cancelled = true
      destroy?.()
    }
  }, [enabled, key])

  return null
}

export default Copybara
