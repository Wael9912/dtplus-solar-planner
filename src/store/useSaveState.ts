// Saving to this device: useAppStore writes every change to localStorage (about 5 MB per site). When the browser refuses
// (storage full) the change would only live until the next reload — this storage wrapper records the failure so the app
// can say so (SaveBanner) instead of losing work silently, and clears it as soon as a save works again.
import { create } from 'zustand'
import type { StateStorage } from 'zustand/middleware'

export const useSaveState = create<{ failed: boolean }>(() => ({ failed: false }))

export const savingStorage: StateStorage = {
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v)
      if (useSaveState.getState().failed) useSaveState.setState({ failed: false })
    } catch (e) {
      console.warn('save failed', e)
      if (!useSaveState.getState().failed) useSaveState.setState({ failed: true })
    }
  },
  removeItem: (k) => localStorage.removeItem(k),
}
