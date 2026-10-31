import { create } from 'zustand'

export interface Toast { id: number; message: string; action?: { label: string; run: () => void }; tone?: 'ok' | 'err' | 'info' }
interface ToastState { toasts: Toast[]; push: (t: Omit<Toast, 'id'> & { duration?: number }) => number; dismiss: (id: number) => void }

let seq = 0
/** Small toast/snackbar store. Destructive actions push a toast with an Undo action instead of asking for confirmation. */
export const useToast = create<ToastState>()((set, get) => ({
  toasts: [],
  push: ({ duration, ...t }) => {
    const id = ++seq
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] })
    window.setTimeout(() => get().dismiss(id), duration ?? (t.action ? 7000 : 3500))
    return id
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}))
export const toast = (t: Omit<Toast, 'id'> & { duration?: number }) => useToast.getState().push(t)
