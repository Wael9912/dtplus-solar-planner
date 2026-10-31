import { useSyncExternalStore } from 'react'

export function useMediaQuery(q: string) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => window.matchMedia(q).matches,
    () => false,
  )
}
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)')
export const useIsSm = () => useMediaQuery('(min-width: 640px)')
