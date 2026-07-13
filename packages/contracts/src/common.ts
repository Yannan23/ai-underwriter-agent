import { z } from 'zod'

/** Controlled occupation taxonomy — Stage 1b classifies free text into one of these. */
export const OCCUPATION_CLASSES = [
  'management_consultant',
  'it_consultant',
  'accountant',
  'bookkeeper',
  'engineering_consultant',
  'architect',
  'marketing_media',
  'allied_health',
  'real_estate_agent',
  'training_education',
] as const
export const OccupationClass = z.enum(OCCUPATION_CLASSES)
export type OccupationClass = z.infer<typeof OccupationClass>

export const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const
export const AuState = z.enum(AU_STATES)
export type AuState = z.infer<typeof AuState>

/** Application status machine — the source of truth for pipeline resumability (PRD §7). */
export const APPLICATION_STATUSES = [
  'received',
  'extracting',
  'awaiting_info',
  'assessing',
  'priced',
  'auto_approved',
  'referred',
  'quoted',
  'declined',
  'expired',
] as const
export const ApplicationStatus = z.enum(APPLICATION_STATUSES)
export type ApplicationStatus = z.infer<typeof ApplicationStatus>
