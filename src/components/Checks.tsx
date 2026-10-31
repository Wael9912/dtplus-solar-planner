import { CircleAlert, TriangleAlert, CircleCheck, ArrowLeft, ArrowRight } from 'lucide-react'
import type { Check, StepKey } from '../engine/types'
import { useT } from '../i18n'
import { checkStep, checkText } from '../i18n/labels'
import { sortChecks } from './wizardModel'


/** Design checks with a status icon and a "Fix in …" jump to the step where the user can resolve them. */
export function ChecksList({ checks, current, onGo, dense = false }: { checks: Check[]; current?: StepKey; onGo: (s: StepKey) => void; dense?: boolean }) {
  const { t, lang, dir } = useT()
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight
  return (
    <ul className={`divide-y divide-slate-100 ${dense ? '' : '-my-2'}`} data-testid="checks">
      {sortChecks(checks).map((c) => {
        const step = checkStep(c)
        const Icon = c.level === 'error' ? CircleAlert : c.level === 'warn' ? TriangleAlert : CircleCheck
        const tone = c.level === 'error' ? 'text-red-600' : c.level === 'warn' ? 'text-amber-600' : 'text-emerald-600'
        return (
          <li key={c.id + c.message} className="flex items-start gap-3 py-2.5" data-level={c.level}>
            <Icon size={20} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <span className="sr-only">{c.level === 'error' ? t.common.error : c.level === 'warn' ? t.common.warn : t.common.ok}: </span>
              <p className="text-sm leading-6 text-slate-800">{checkText(c, lang)}</p>
              {step && step !== current && c.level !== 'ok' && (
                <button type="button" className="btn-link mt-0.5 min-h-8" onClick={() => onGo(step)} data-testid={`fix-${c.id}`}>{t.results.fixIn(t.steps[step])}<Arrow size={14} /></button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
