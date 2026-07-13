import type { ApplicationStatus, RawSubmission, StageEvent } from '@prism/contracts'

/**
 * Day-1 state store: in-memory, deliberately. Deploys reset it and demos start
 * fresh — acceptable for the demo, and it keeps deployment dependency-free.
 * Supabase persistence (and with it, resume-across-deploys) is a Day-2 task.
 */
export interface ApplicationRecord {
  id: string
  status: ApplicationStatus
  submission: RawSubmission
  events: StageEvent[]
  createdAt: string
}

export const applications = new Map<string, ApplicationRecord>()

export function appendEvent(record: ApplicationRecord, event: Omit<StageEvent, 'seq' | 'at'>): StageEvent {
  const full: StageEvent = { ...event, seq: record.events.length, at: new Date().toISOString() }
  record.events.push(full)
  return full
}
