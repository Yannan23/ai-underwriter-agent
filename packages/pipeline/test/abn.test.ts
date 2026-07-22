import { describe, expect, test } from 'vitest'

import { isValidAbn } from '../src/abn'

describe('isValidAbn', () => {
  test('accepts the ATO reference ABN', () => {
    expect(isValidAbn('51824753556')).toBe(true)
  })

  test('accepts other known-valid ABNs', () => {
    expect(isValidAbn('53004085616')).toBe(true) // Commonwealth Bank
  })

  test('rejects a single-digit flip of a valid ABN', () => {
    expect(isValidAbn('51824753557')).toBe(false)
    expect(isValidAbn('41824753556')).toBe(false)
  })

  test('rejects wrong length, spaces, and non-digits', () => {
    expect(isValidAbn('')).toBe(false)
    expect(isValidAbn('5182475355')).toBe(false)
    expect(isValidAbn('518247535566')).toBe(false)
    expect(isValidAbn('51 824 753 556')).toBe(false)
    expect(isValidAbn('5182475355a')).toBe(false)
  })

  test('rejects an all-zero ABN', () => {
    expect(isValidAbn('00000000000')).toBe(false)
  })
})
