import { useSyncExternalStore } from 'react'
import { getShellColorMode, subscribeShellAppearance } from './shellAppearance.js'

/** True when shell is in light (white) mode — updates when the left nav toggles appearance. */
export function useShellLightMode() {
  return useSyncExternalStore(
    subscribeShellAppearance,
    () => getShellColorMode() === 'light',
    () => false,
  )
}
