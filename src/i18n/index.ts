import { en } from './en'
import { ar } from './ar'
import { useAppStore } from '../store/useAppStore'
export type Lang = 'en' | 'ar'
export const dicts = { en, ar }
export function useT() {
  const lang = useAppStore((s) => s.lang)
  return { t: dicts[lang], lang, dir: lang === 'ar' ? 'rtl' : 'ltr' as 'rtl' | 'ltr' }
}
