// Saved inputs of the engineering tools (store `tools[id]`): validated against each tool's defaults on read, so a stale or hand-edited
// localStorage entry can never put a wrong type into a calculator. Pure (no React) so it is unit-tested.

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/**
 * Rebuild a stored tool state from its defaults: every key of `defaults` is kept; a stored value is used only when it has the right
 * type — number fields accept a finite number or null (empty field), strings / booleans their own type, nested objects recurse, and
 * keys listed in `enums` (dotted paths for nested keys, e.g. 'module.chemistry') must be one of the listed values. Unknown keys are dropped.
 */
export function normalizeToolState<T extends Record<string, unknown>>(x: unknown, defaults: T, enums: Record<string, readonly unknown[]> = {}, path = ''): T {
  const src = isObj(x) ? x : {}
  const out: Record<string, unknown> = {}
  for (const [k, d] of Object.entries(defaults)) {
    const v = src[k], key = path + k
    const allowed = enums[key]
    if (allowed) out[k] = allowed.includes(v) ? v : d
    else if (typeof d === 'number' || d === null) out[k] = v === null || (typeof v === 'number' && Number.isFinite(v)) ? v : d
    else if (typeof d === 'string' || typeof d === 'boolean') out[k] = typeof v === typeof d ? v : d
    else if (isObj(d)) out[k] = normalizeToolState(v, d, enums, key + '.')
    else out[k] = d
  }
  return out as T
}
