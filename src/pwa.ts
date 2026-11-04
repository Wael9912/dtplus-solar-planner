// Installable app (PWA). Production builds register the service worker (pwa/sw.js → dist/sw.js) that caches the build for
// offline use. Chrome / Edge / Samsung Internet offer installation through `beforeinstallprompt`, kept here so the app's own
// "Install app" buttons can open the browser's dialog; Safari has no such event, so the app shows the steps instead.
import { create } from 'zustand'

interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
/** prompt = the browser's install dialog is available; ios = Share → Add to Home Screen; mac = Safari File → Add to Dock; other = browser menu. */
export type InstallWay = 'installed' | 'prompt' | 'ios' | 'mac' | 'other'
/** localStorage: the home-screen install banner was closed on this device. */
export const BANNER_KEY = 'dtplus-install-dismissed'

interface PwaState { deferred: InstallPromptEvent | null; installed: boolean; sheet: boolean; bannerClosed: boolean }

const has = typeof window !== 'undefined'
const standalone = () => has && (matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)
const readClosed = () => { try { return localStorage.getItem(BANNER_KEY) === '1' } catch { return false } }
export const usePwa = create<PwaState>()(() => ({ deferred: null, installed: standalone(), sheet: false, bannerClosed: readClosed() }))

/** How this browser installs the app (pure, from the user agent and touch points). */
export function installWayFor(x: { installed: boolean; prompt: boolean; ua: string; touchPoints: number }): InstallWay {
  if (x.installed) return 'installed'
  if (x.prompt) return 'prompt'
  if (/iPhone|iPad|iPod/.test(x.ua) || (/Macintosh/.test(x.ua) && x.touchPoints > 1)) return 'ios'
  if (/Macintosh/.test(x.ua) && /Safari\//.test(x.ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/.test(x.ua)) return 'mac'
  return 'other'
}
export const useInstallWay = (): InstallWay => {
  const installed = usePwa((s) => s.installed), prompt = usePwa((s) => !!s.deferred)
  return installWayFor({ installed, prompt, ua: has ? navigator.userAgent : '', touchPoints: has ? navigator.maxTouchPoints ?? 0 : 0 })
}

/** Open the browser's install dialog when there is one, else the steps for this browser. */
export async function install(): Promise<void> {
  const d = usePwa.getState().deferred
  if (!d) { usePwa.setState({ sheet: true }); return }
  try {
    await d.prompt()
    const { outcome } = await d.userChoice
    // The event can be used once; Chrome fires a new one if the user said no
    usePwa.setState({ deferred: null, ...(outcome === 'accepted' ? { installed: true } : {}) })
  } catch { usePwa.setState({ deferred: null, sheet: true }) }
}
export const closeInstallSheet = () => usePwa.setState({ sheet: false })
export function closeBanner() {
  usePwa.setState({ bannerClosed: true })
  try { localStorage.setItem(BANNER_KEY, '1') } catch { /* private mode: closed for this visit only */ }
}

export function startPwa() {
  if (!has) return
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); usePwa.setState({ deferred: e as InstallPromptEvent }) })
  addEventListener('appinstalled', () => usePwa.setState({ deferred: null, installed: true, sheet: false }))
  matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => usePwa.setState({ installed: standalone() }))
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((e) => console.warn('service worker', e)) }
    if (document.readyState === 'complete') register(); else addEventListener('load', register, { once: true })
  }
}
