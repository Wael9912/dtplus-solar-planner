import { describe, expect, it } from 'vitest'
import { cmpVersion, decide, notesSince, startNotice, VERSION, BUILD } from '../src/updates'
import { en } from '../src/i18n/en'
import { ar } from '../src/i18n/ar'

describe('app updates', () => {
  it('compares versions numerically', () => {
    expect(cmpVersion('0.10.0', '0.9.1')).toBe(1)
    expect(cmpVersion('0.2.1', '0.2.1')).toBe(0)
    expect(cmpVersion('0.2', '0.2.0')).toBe(0)
    expect(cmpVersion('0.1.0', '0.2.0')).toBe(-1)
  })

  it('the build id carries the package version', () => {
    expect(BUILD.startsWith(`${VERSION}+`)).toBe(true)
  })

  it('reloads between tasks, offers a button while the user is busy, never loops', () => {
    const idle = { visible: true, busy: false, tried: false }
    expect(decide('start', idle)).toBe('reload')
    expect(decide('resume', idle)).toBe('reload')
    expect(decide('timer', idle)).toBe('banner')
    expect(decide('resume', { ...idle, busy: true })).toBe('banner')
    expect(decide('resume', { ...idle, visible: false })).toBe('none')
    expect(decide('chunk', { ...idle, busy: true })).toBe('reload')
    expect(decide('resume', { ...idle, tried: true })).toBe('banner')
    expect(decide('manual', { visible: true, busy: true, tried: true })).toBe('reload')
  })

  it('returning devices see what is new; new devices see nothing', () => {
    const base = { build: 'b2', version: '0.2.1', mark: null }
    expect(startNotice({ ...base, seen: null, hadData: false })).toBeNull()
    expect(startNotice({ ...base, seen: null, hadData: true })).toEqual({ kind: 'whatsNew', since: '0.1.0' })
    expect(startNotice({ ...base, seen: '0.2.0', hadData: true })).toEqual({ kind: 'whatsNew', since: '0.2.0' })
    expect(startNotice({ ...base, seen: '0.2.1', hadData: true })).toBeNull()
    // Same version, new build (a fix published without a version bump): short "updated" message after the reload
    expect(startNotice({ ...base, seen: '0.2.1', hadData: true, mark: { from: 'b1', to: 'b2', at: 0 } })).toEqual({ kind: 'updated' })
  })

  it('release notes: every skipped version, none past this one, both languages', () => {
    const notes = { '0.2.0': ['a'], '0.2.1': ['b'], '9.0.0': ['future'] }
    expect(notesSince('0.1.0', notes)).toEqual(VERSION === '0.2.1' ? ['a', 'b'] : expect.any(Array))
    expect(notesSince(VERSION, notes)).toEqual([])
    expect(Object.keys(en.updates.notes)).toEqual(Object.keys(ar.updates.notes))
    for (const v of Object.keys(en.updates.notes)) expect(ar.updates.notes[v].length).toBe(en.updates.notes[v].length)
    // The current version has notes, so an update always says what changed
    expect(en.updates.notes[VERSION]?.length).toBeGreaterThan(0)
  })
})
