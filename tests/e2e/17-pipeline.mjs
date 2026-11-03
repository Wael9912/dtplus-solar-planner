// Scenario h — pipeline: load samples, mark one Lost, search by phone digits, New revision → reference -R2, status draft.
import { scenario, loadSamples, projectCards, go, numOf } from './lib.mjs'

await scenario('17-pipeline', async (c) => {
  const { page, T } = c
  await loadSamples(page)
  const cards = projectCards(page)
  if ((await cards.count()) !== 4) return c.bad(`expected 4 samples, got ${await cards.count()}`)
  await c.check('pipeline: samples', { shotName: 'samples' })
  const cardFor = (ref) => cards.filter({ hasText: ref })

  // mark the Dubai warehouse lost (Client step = step 1 of a full design)
  await cardFor('Q-2026-0120').getByTestId('project-open').click(); await page.waitForTimeout(300)
  await page.getByTestId('info-status').selectOption('lost')
  await go(page, 'projects')
  const lostCount = numOf(await page.getByTestId('filter-lost').innerText())
  if (lostCount !== 1) c.bad(`Lost filter shows ${lostCount}`)
  await page.getByTestId('filter-lost').click(); await page.waitForTimeout(200)
  if ((await cards.count()) !== 1 || !(await cardFor('Q-2026-0120').count())) c.bad('Lost filter does not show exactly the lost project')
  const badge = (await cards.first().innerText()).includes(T.info.statuses.lost)
  if (!badge) c.bad('lost card has no "Lost" badge')
  await c.check('pipeline: lost filter', { shotName: 'lost' })
  await page.getByTestId('filter-all').click()

  // phone number on the pharmacy, then search by digits in several real-life formats
  await cardFor('Q-2026-0105').getByTestId('project-open').click(); await page.waitForTimeout(300)
  await page.locator('input[type=tel]').fill('+249 912 345 678')
  await go(page, 'projects')
  const search = page.getByTestId('projects-search')
  for (const [q, want] of [['912345', 1], ['912 345 678', 1], ['+249-912', 1], ['٩١٢٣٤٥', 1], ['0912345678', 1], ['555', 0]]) {
    await search.fill(q); await page.waitForTimeout(250)
    const n = await cards.count()
    if (n !== want) (q === '0912345678' ? c.warn : c.bad)(`phone search "${q}" → ${n} card(s), expected ${want}${q === '0912345678' ? ' (local format with leading 0 does not find +249 numbers)' : ''}`)
  }
  await search.fill('912345'); await page.waitForTimeout(200)
  await c.check('pipeline: phone search', { shotName: 'search' })
  await search.fill('')

  // new revision of the lost project
  const lost = cardFor('Q-2026-0120')
  await lost.getByTestId('project-menu').click(); await page.getByTestId('project-revision').click(); await page.waitForTimeout(400)
  if (!/#\/p\//.test(page.url())) return c.bad(`new revision did not open the copy: ${page.url()}`)
  const ref = await page.getByLabel(T.info.reference, { exact: true }).inputValue()
  const status = await page.getByTestId('info-status').inputValue()
  if (ref !== 'Q-2026-0120-R2') c.bad(`revision reference "${ref}", expected Q-2026-0120-R2`)
  if (status !== 'draft') c.bad(`revision status "${status}", expected draft`)
  c.ok(`revision: ${ref} / ${status}`)
  await c.check('pipeline: revision opened', { shotName: 'revision' })
  await go(page, 'projects')
  if ((await cards.count()) !== 5) c.bad(`after a revision there are ${await cards.count()} projects`)
  // the original keeps its status; a second revision of the original is -R3
  await page.getByTestId('filter-lost').click(); await page.waitForTimeout(200)
  if ((await cards.count()) !== 1) c.bad('original lost project changed status after revision')
  await page.getByTestId('filter-all').click()
  await cardFor('Q-2026-0120').filter({ hasNotText: '-R2' }).first().getByTestId('project-menu').click()
  await page.getByTestId('project-revision').click(); await page.waitForTimeout(400)
  const ref3 = await page.getByLabel(T.info.reference, { exact: true }).inputValue()
  if (ref3 !== 'Q-2026-0120-R3') c.bad(`second revision reference "${ref3}", expected -R3`)
  await go(page, 'projects')
  // revision of a revision continues the series (R2 → R4)
  await cardFor('Q-2026-0120-R2').getByTestId('project-menu').click(); await page.getByTestId('project-revision').click(); await page.waitForTimeout(400)
  const ref4 = await page.getByLabel(T.info.reference, { exact: true }).inputValue()
  if (ref4 !== 'Q-2026-0120-R4') c.bad(`revision of R2 reference "${ref4}", expected -R4`)
  await go(page, 'projects')
  // sort by value and by name keep working with the copies
  for (const s of ['value', 'name', 'updated']) { await page.getByTestId('projects-sort').selectOption(s); await page.waitForTimeout(150) }
  await c.check('pipeline: final list', { shotName: 'final' })
  const totals = await cards.locator('[data-testid=project-figures]').allInnerTexts()
  c.ok(`cards: ${totals.map((x) => x.replace(/\s+/g, ' ')).join(' | ').slice(0, 300)}`)
})
