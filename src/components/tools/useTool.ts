// Non-component helpers of the engineering tools: tool ids, number formatting, persisted inputs, the default site.
import { useMemo, type ComponentType } from 'react'
import { BatteryFull, Cable, Fuel, SolarPanel } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { locations } from '../../data/locations'
import { fmt } from '../../engine/format'
import type { Location } from '../../engine/types'
import { normalizeToolState } from './state'

export const TOOL_IDS = ['strings', 'battery', 'cable', 'generator'] as const
export type ToolId = (typeof TOOL_IDS)[number]
export const isToolId = (x: unknown): x is ToolId => TOOL_IDS.includes(x as ToolId)
export const TOOL_ICONS: Record<ToolId, ComponentType<{ size?: number; className?: string }>> = { strings: SolarPanel, battery: BatteryFull, cable: Cable, generator: Fuel }

/** Number for display: rounded, Western digits, thousands separators; never NaN (dash). */
export const num = (x: number | null | undefined, d = 0) => (x == null || !Number.isFinite(x) ? '–' : fmt(x, d))
/** Up to `d` decimals without trailing zeros (52.6, 485, 0.38). */
export const numT = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '–' : Number(x.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d }))

/**
 * Inputs of one tool, persisted in the store (`tools[id]`) and validated against `defaults` on every read.
 * `defaults` must be stable (useMemo) — it also decides the shape that is saved.
 */
export function useToolState<T extends Record<string, unknown>>(id: ToolId, defaults: T, enums: Record<string, readonly unknown[]> = {}) {
  const raw = useAppStore((s) => s.tools[id])
  const setTool = useAppStore((s) => s.setTool)
  const state = useMemo(() => normalizeToolState(raw, defaults, enums), [raw, defaults, enums])
  const set = (patch: Partial<T> | ((s: T) => Partial<T>)) => {
    const cur = normalizeToolState(useAppStore.getState().tools[id], defaults, enums)
    setTool(id, { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) })
  }
  return [state, set] as const
}

/** The company's default location (falls back to Khartoum) — the default site of the tools. */
export function useDefaultLocation(): Location {
  const id = useAppStore((s) => s.company.defaultLocationId)
  return useMemo(() => locations.find((l) => l.id === id) ?? locations.find((l) => l.id === 'khartoum') ?? locations[0], [id])
}
/** Hot-day ambient used by the engine for a location (rounded max of the monthly average highs). */
export const hotOf = (l: Location) => Math.round(Math.max(...(Array.isArray(l.avgHighTempC) ? l.avgHighTempC : [l.avgHighTempC])))

/** Plain-text line for the copied summary. */
export const line = (label: string, value: string) => `${label}: ${value}`
