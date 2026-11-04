// Pass / fail matrix (scenario × browser × language) from the per-scenario JSON files written by scenario().
import fs from 'node:fs'
import path from 'node:path'
import { RESULTS, COMBOS } from './lib.mjs'

const ROWS = [['a', '10-calc'], ['b', '11-size'], ['c', '12-ups'], ['d', '13-items'], ['e', '14-bill'], ['f', '15-expansion'], ['g', '16-company'],
  ['h', '17-pipeline'], ['i', '18-tools'], ['j', '19-outage'], ['k', '20-convert'], ['l', '21-migrate'], ['m', '22-abuse-nav'], ['m', '23-abuse-data'], ['n', '24-home'], ['o', '25-scale']]
const read = (n) => { const f = path.join(RESULTS, `${n}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {} }
const cell = (r) => (!r ? '—' : r.status === 'PASS' ? (r.warnings?.length ? `PASS (${r.warnings.length}w)` : 'PASS') : `FAIL (${r.issues.length})`)
const head = ['', 'script', ...COMBOS.map((c) => c.id)]
const lines = [head, ...ROWS.map(([k, n]) => { const r = read(n); return [k, n, ...COMBOS.map((c) => cell(r[c.id]))] })]
const w = head.map((_, i) => Math.max(...lines.map((l) => String(l[i]).length)))
console.log('\n' + lines.map((l) => l.map((x, i) => String(x).padEnd(w[i])).join('  ')).join('\n'))
const out = path.join(RESULTS, 'matrix.md')
fs.writeFileSync(out, ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...lines.slice(1).map((l) => '| ' + l.join(' | ') + ' |')].join('\n') + '\n')
for (const [, n] of ROWS) for (const [id, r] of Object.entries(read(n))) for (const m of r.issues ?? []) console.log(` - ${n} ${id}: ${m.slice(0, 300)}`)
console.log(`\nmatrix: ${out}`)
