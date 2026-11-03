// Run the e2e suite against the dev server on :5179 (start it first: `npx vite --port 5179 --strictPort`).
//   node tests/e2e/run-all.mjs                 → regression suite 01–06, then every scenario 10–23, then the matrix
//   node tests/e2e/run-all.mjs 1 13 22         → only the scripts whose names start with those numbers
//   LANES=3 node tests/e2e/run-all.mjs         → scenarios in 3 parallel lanes (default 1)
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SHOTS } from './lib.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const want = process.argv.slice(2)
const all = fs.readdirSync(dir).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort()
const pick = (f) => !want.length || want.some((w) => f.startsWith(w.padStart(2, '0')))
// 02 runs once per viewport; 05 imports the JSON 02 exported, so 02 must finish before 05
const jobs = all.filter(pick).flatMap((f) => (f.startsWith('02-') ? [[f, 'desktop'], [f, 'mobile']] : [[f]]))
const logs = path.join(SHOTS, 'logs'); fs.mkdirSync(logs, { recursive: true })

const run = ([f, ...args]) => new Promise((res) => {
  const t0 = Date.now()
  const log = path.join(logs, `${f.replace(/\.mjs$/, '')}${args.length ? '-' + args.join('-') : ''}.log`)
  const out = fs.createWriteStream(log)
  const p = spawn(process.execPath, [path.join(dir, f), ...args], { cwd: dir })
  p.stdout.pipe(out); p.stderr.pipe(out)
  p.on('close', (code) => {
    const txt = fs.readFileSync(log, 'utf8')
    const n = (txt.match(/^ISSUE:/gm) || []).length
    console.log(`${code === 0 && !n ? 'ok  ' : 'FAIL'} ${f} ${args.join(' ')} — ${n} issue(s), exit ${code}, ${Math.round((Date.now() - t0) / 1000)} s  (${log})`)
    res({ f, code, n })
  })
})

const regression = jobs.filter(([f]) => Number(f.slice(0, 2)) < 10)
const scenarios = jobs.filter(([f]) => Number(f.slice(0, 2)) >= 10)
const results = []
for (const j of regression) results.push(await run(j))
const lanes = Math.max(1, Number(process.env.LANES || 1))
const queue = [...scenarios]
await Promise.all(Array.from({ length: lanes }, async () => { while (queue.length) results.push(await run(queue.shift())) }))
if (scenarios.length) await import('./matrix.mjs')
process.exitCode = results.some((r) => r.code !== 0 || r.n) ? 1 : 0
