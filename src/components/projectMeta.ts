// Project-list helpers shared by the home screen and the history: status badge colours and the bundled samples in the UI language.
import type { Project } from '../engine/types'
import type { Lang } from '../store/useAppStore'
import { sampleProjects } from '../data/samples'
import { matchAppliance } from '../i18n/labels'

export const statusLevel: Record<Project['status'], 'neutral' | 'info' | 'ok' | 'error'> = { draft: 'neutral', quoted: 'info', approved: 'ok', installed: 'ok', lost: 'error' }
// Arabic display data for the bundled samples (keyed by quote reference)
const SAMPLE_AR: Record<string, Partial<Project>> = {
  'Q-2026-0112': { name: 'فيلا الرياض — نظام هجين 10 كيلوواط', clientName: 'أحمد الفهد', clientAddress: 'حي الياسمين، الرياض' },
  'Q-2026-0098': { name: 'مزرعة الأبيض — مضخة منفصلة عن الشبكة', clientName: 'مريم عثمان', clientAddress: 'الأبيض، شمال كردفان' },
  'Q-2026-0105': { name: 'صيدلية الخرطوم — نظام هجين احتياطي', clientName: 'صيدلية د. صلاح', clientAddress: 'شارع 15، العمارات، الخرطوم' },
  'Q-2026-0120': { name: 'مستودع دبي — 100 كيلوواط متصل بالشبكة', clientName: 'الخليج للخدمات اللوجستية ذ.م.م', clientAddress: 'المنطقة الحرة بجبل علي' },
}
/** The four sample projects; in Arabic with Arabic names, clients, addresses and appliance names. */
export const localizedSamples = (lang: Lang): Project[] => sampleProjects().map((p) => (lang !== 'ar' ? p
  : { ...p, ...SAMPLE_AR[p.reference], loads: p.loads.map((l) => ({ ...l, name: matchAppliance(l.name)?.nameAr ?? l.name })) }))
