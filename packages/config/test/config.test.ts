import { describe, expect, it } from 'vitest'
import { appetite, rating } from '../src/index'

describe('versioned configs', () => {
  it('appetite config parses and is versioned', () => {
    expect(appetite.version).toBe('appetite.v1')
    expect(appetite.occupationClassesInAppetite).toContain('management_consultant')
  })

  it('every in-appetite class has a base rate and minimum premium', () => {
    for (const cls of appetite.occupationClassesInAppetite) {
      expect(rating.baseRate[cls], `baseRate missing for ${cls}`).toBeTypeOf('number')
      expect(rating.minimumPremium[cls], `minimumPremium missing for ${cls}`).toBeTypeOf('number')
    }
  })

  it('revenue bands end with an open-ended band', () => {
    expect(rating.revenueBands.at(-1)?.upTo).toBeNull()
  })
})
