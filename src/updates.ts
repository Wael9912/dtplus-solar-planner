// Keeps open copies of the app current. Phones keep a tab in memory for days without reloading it, so a published version
// would otherwise reach a phone only when the user reloads by hand. The build writes version.json (vite.config.ts); the
// app compares it with its own build id when it starts, when the user comes back to the tab, when the connection returns
// and every 15 minutes. A newer build reloads the app straight away when nothing is in progress (data is saved on every
// change and the screen is in the URL); while the user is typing or has a dialog open, a banner offers "Update now".
// After the reload the app says what changed.
import { create } from 'zustand'

export const BUILD = __BUILD_ID__
export const VERSION = __APP_VERSION__
/** localStorage: the version this device last ran (its release notes were shown). */
export const SEEN_KEY = 'dtplus-seen-version'
/** sessionStorage: set just before an update reload, so the next start knows it was updated (and never reloads in a loop). */
export const MARK_KEY = 'dtplus-update'
const TIMER_MS = 15 * 60_000
const MIN_GAP_MS = 10_000

export type CheckReason = 'start' | 'resume' | 'timer' | 'manual' | 'chunk'
export interface UpdateMark { from: string; to: string; at: number }
export type Notice = { kind: 'whatsNew'; since: string } | { kind: 'updated' }

interface UpdateState {
  /** Version of a newer build waiting for "Update now" ('' when version.json has none); null = up to date. */
  available: string | null
  notice: Notice | null
}
export const useUpdates = create<UpdateState>()(() => ({ available: null, notice: null }))

/** Numeric version compare ('0.10.0' > '0.9.1'); missing parts count as 0. */
export function cmpVersion(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => parseInt(x, 10) || 0), pb = b.split(/[.+-]/).map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return Math.sign(d) }
  return 0
}

/** Release notes newer than `since`, oldest version first (one flat list). */
export function notesSince(since: string, notes: Record<string, readonly string[]>): string[] {
  return Object.keys(notes).filter((v) => cmpVersion(v, since) > 0 && cmpVersion(v, VERSION) <= 0)
    .sort(cmpVersion).flatMap((v) => notes[v])
}

/** What to do when the published build differs from this one. */
export function decide(reason: CheckReason, env: { visible: boolean; busy: boolean; tried: boolean }): 'reload' | 'banner' | 'none' {
  if (reason === 'manual') return 'reload'
  // A reload for this build already ran and brought this copy back (a cache in between): offer the button, never loop
  if (env.tried) return 'banner'
  // Hidden tab: coming back to it checks again
  if (!env.visible) return 'none'
  // A failed file of the old version means the user's action failed anyway; start and resume are between tasks
  if (reason === 'chunk' || ((reason === 'start' || reason === 'resume') && !env.busy)) return 'reload'
  return 'banner'
}

/** Message to show when the app starts, from the stored version, a returning device and the update mark. */
export function startNotice(x: { seen: string | null; hadData: boolean; mark: UpdateMark | null; build: string; version: string }): Notice | null {
  // A device that used the app before it stored versions ran v0.1 or v0.2.0
  const since = x.seen ?? (x.hadData ? '0.1.0' : null)
  if (since && cmpVersion(x.version, since) > 0) return { kind: 'whatsNew', since }
  if (x.mark && x.mark.from !== x.build) return { kind: 'updated' }
  return null
}

const read = (s: () => Storage, k: string) => { try { return s().getItem(k) } catch { return null } }
const write = (s: () => Storage, k: string, v: string | null) => { try { if (v == null) s().removeItem(k); else s().setItem(k, v) } catch { /* private mode */ } }
function readMark(): UpdateMark | null {
  try {
    const m = JSON.parse(read(() => sessionStorage, MARK_KEY) ?? 'null') as UpdateMark | null
    return m && typeof m.from === 'string' && typeof m.to === 'string' && typeof m.at === 'number' ? m : null
  } catch { return null }
}

/** Typing in a field, or a dialog or menu open: reloading now would lose what is on screen. */
function busy(): boolean {
  const a = document.activeElement as HTMLElement | null
  return (!!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) || !!document.querySelector('[role=dialog],[role=menu]')
}

/** Reload into the published version. */
export function applyUpdate(to = 'latest') {
  write(() => sessionStorage, MARK_KEY, JSON.stringify({ from: BUILD, to, at: Date.now() } satisfies UpdateMark))
  location.reload()
}

let lastCheck = 0
/** Ask the server for the published build. 'latest' = this is it; 'offline' = could not ask; 'updating' = reloading now. */
export async function checkForUpdate(reason: CheckReason): Promise<'latest' | 'offline' | 'updating' | 'available'> {
  // The dev server has no version.json
  if (!import.meta.env.PROD) return 'latest'
  const now = Date.now()
  if ((reason === 'start' || reason === 'resume') && now - lastCheck < MIN_GAP_MS) return 'latest'
  lastCheck = now
  let remote: { version?: unknown; build?: unknown }
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${now}`, { cache: 'no-store' })
    if (!r.ok) return 'offline'
    remote = await r.json()
  } catch { return 'offline' }
  if (typeof remote.build !== 'string' || !remote.build || remote.build === BUILD) return 'latest'
  const mark = readMark()
  const d = decide(reason, { visible: document.visibilityState === 'visible', busy: busy(), tried: !!mark && mark.from === BUILD && mark.to === remote.build })
  if (d === 'reload') { applyUpdate(remote.build); return 'updating' }
  if (d === 'banner') useUpdates.setState({ available: typeof remote.version === 'string' ? remote.version : '' })
  return 'available'
}

/** Call once before the first render: works out the start message and starts watching for new versions (production builds). */
export function startUpdates() {
  if (!import.meta.env.PROD) return
  const mark = readMark()
  // The reload brought this same build back: keep the mark so the same build is not retried in a loop
  if (!mark || mark.from !== BUILD) {
    write(() => sessionStorage, MARK_KEY, null)
    const hadData = !!(window as unknown as { __DT_HAD_DATA__?: boolean }).__DT_HAD_DATA__
    useUpdates.setState({ notice: startNotice({ seen: read(() => localStorage, SEEN_KEY), hadData, mark, build: BUILD, version: VERSION }) })
    write(() => localStorage, SEEN_KEY, VERSION)
  }
  const resume = () => { if (document.visibilityState === 'visible') void checkForUpdate('resume') }
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('pageshow', (e) => { if (e.persisted) resume() })
  window.addEventListener('online', resume)
  window.setInterval(() => { if (document.visibilityState === 'visible') void checkForUpdate('timer') }, TIMER_MS)
  // A lazy file (PDF, Excel) of this version is gone from the server: a newer version was published while the tab was open
  window.addEventListener('vite:preloadError', () => { void checkForUpdate('chunk') })
  window.setTimeout(() => void checkForUpdate('start'), 1500)
}
