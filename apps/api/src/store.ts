import type {
  ApplicationStatus,
  CitationCheck,
  EligibilityResult,
  Quote,
  RawSubmission,
  RfiRequest,
  RiskAssessment,
  RoutingResult,
  StageEvent,
} from '@prism/contracts'

/**
 * Day-1 state store: in-memory, deliberately. Deploys reset it and demos start
 * fresh — acceptable for the demo, and it keeps deployment dependency-free.
 * Supabase persistence (and with it, resume-across-deploys) is a Day-2 task.
 */
export interface ApplicationResult {
  status: ApplicationStatus
  routing?: RoutingResult
  quote?: Quote
  riskAssessment?: RiskAssessment
  citationCheck?: CitationCheck
  eligibility?: EligibilityResult
  rfi?: RfiRequest
  error?: string
}

export interface ApplicationRecord {
  id: string
  status: ApplicationStatus
  submission: RawSubmission
  events: StageEvent[]
  done: boolean
  result?: ApplicationResult
  createdAt: string
}

export interface Subscriber {
  onEvent: (event: StageEvent) => void
  onDone: () => void
}

export const applications = new Map<string, ApplicationRecord>()
const subscribers = new Map<string, Set<Subscriber>>()

export function createApplication(id: string, submission: RawSubmission): ApplicationRecord {
  const record: ApplicationRecord = {
    id,
    status: 'received',
    submission,
    events: [],
    done: false,
    createdAt: new Date().toISOString(),
  }
  applications.set(id, record)
  return record
}

export function subscribe(id: string, sub: Subscriber): () => void {
  const set = subscribers.get(id) ?? new Set<Subscriber>()
  set.add(sub)
  subscribers.set(id, set)
  return () => set.delete(sub)
}

export function appendEvent(record: ApplicationRecord, event: Omit<StageEvent, 'seq' | 'at'>): StageEvent {
  const full: StageEvent = { ...event, seq: record.events.length, at: new Date().toISOString() }
  record.events.push(full)
  for (const sub of subscribers.get(record.id) ?? []) sub.onEvent(full)
  return full
}

export function finish(record: ApplicationRecord, result: ApplicationResult): void {
  record.result = result
  record.status = result.status
  record.done = true
  for (const sub of subscribers.get(record.id) ?? []) sub.onDone()
}
