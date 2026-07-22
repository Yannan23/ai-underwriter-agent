/** Official ABN position weights (ATO / ABR checksum). */
const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const

/**
 * True when `abn` is 11 digits and passes the ABR weighted-modulus-89 check.
 * Does not call the ABR Lookup API — format + checksum only.
 */
export function isValidAbn(abn: string): boolean {
  if (!/^\d{11}$/.test(abn)) return false

  let sum = 0

  for (const [i, weight] of WEIGHTS.entries()) {
    sum += (Number(abn.charAt(i)) - (i === 0 ? 1 : 0)) * weight
  }

  return sum % 89 === 0
}
