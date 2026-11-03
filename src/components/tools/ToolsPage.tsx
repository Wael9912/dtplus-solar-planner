// Engineering tools (view `tools`, #/tools and #/tools/<id>): standalone calculators that need no project and no load list.
import type { ComponentType } from 'react'
import { BatteryFull, Cable, ChevronLeft, ChevronRight, Fuel, SolarPanel } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n'
import { TOOL_IDS, isToolId, type ToolId } from './useTool'
import { StringsTool } from './StringsTool'
import { BatteryTool } from './BatteryTool'
import { CableTool } from './CableTool'
import { GeneratorTool } from './GeneratorTool'

const ICONS: Record<ToolId, ComponentType<{ size?: number; className?: string }>> = { strings: SolarPanel, battery: BatteryFull, cable: Cable, generator: Fuel }
const VIEWS: Record<ToolId, ComponentType> = { strings: StringsTool, battery: BatteryTool, cable: CableTool, generator: GeneratorTool }

export function ToolsPage() {
  const toolId = useAppStore((s) => s.toolId)
  // Unknown or missing id → the list
  if (isToolId(toolId)) { const View = VIEWS[toolId]; return <View key={toolId} /> }
  return <ToolList />
}

function ToolList() {
  const { t, dir } = useT()
  const openTool = useAppStore((s) => s.openTool)
  const Go = dir === 'rtl' ? ChevronLeft : ChevronRight
  return (
    <div className="space-y-4 sm:space-y-5" data-testid="tools-page">
      <div>
        <h1 className="text-display text-slate-900">{t.tools.title}</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-slate-600">{t.tools.intro}</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {TOOL_IDS.map((id) => {
          const Icon = ICONS[id]
          return (
            <li key={id}>
              <button type="button" onClick={() => openTool(id)} data-testid={`tool-card-${id}`}
                className="card flex h-full w-full items-start gap-4 p-4 text-start transition hover:border-brand-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:p-5">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon size={24} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-title text-slate-900">{t.tools.names[id]}</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">{t.tools.helps[id]}</span>
                </span>
                <Go size={20} className="mt-3 shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
