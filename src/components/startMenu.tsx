import { Calculator, PencilRuler, Gauge, ShoppingCart, Wrench } from 'lucide-react'
import type { ComponentType } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'

export type StartKey = 'calc' | 'size' | 'items' | 'design' | 'tools'
export interface StartAction { key: StartKey; label: string; help: string; icon: ComponentType<{ size?: number; className?: string }>; run: () => void }

/** The ways to start work, in the order a sales desk reaches for them — shared by the home tiles and the header "New" menu. */
export function useStartActions(): StartAction[] {
  const { t } = useT()
  const createProject = useAppStore((s) => s.createProject)
  const startCalc = useAppStore((s) => s.startCalc)
  const openTool = useAppStore((s) => s.openTool)
  return [
    { key: 'calc', label: t.modes.calc, help: t.modes.calcHelp, icon: Calculator, run: () => startCalc() },
    { key: 'size', label: t.modes.size, help: t.modes.sizeHelp, icon: Gauge, run: () => createProject({}, 'size') },
    { key: 'items', label: t.modes.items, help: t.modes.itemsHelp, icon: ShoppingCart, run: () => createProject({}, 'items') },
    { key: 'design', label: t.modes.design, help: t.modes.designHelp, icon: PencilRuler, run: () => createProject({}, 'design') },
    { key: 'tools', label: t.modes.tools, help: t.modes.toolsHelp, icon: Wrench, run: () => openTool(null) },
  ]
}
