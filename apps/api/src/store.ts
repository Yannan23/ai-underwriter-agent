import {
  type ApplicationStatus,
  type CitationCheck,
  type EligibilityResult,
  type Quote,
  type RawSubmission,
  type RfiRequest,
  type RiskAssessment,
  type RoutingResult,
  type StageEvent,
} from '@prism/contracts'

/**
 * Legacy local-demo store: in-memory by design so mock runs need no external
 * dependencies. The production rebuild replaces this with Aurora-backed
 * modules, Transactional Outbox, and recoverable workflow state.
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

export function createApplication(
  id: string,
  submission: RawSubmission
): ApplicationRecord {
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

export function appendEvent(
  record: ApplicationRecord,
  event: Omit<StageEvent, 'seq' | 'at'>
): StageEvent {
  const full: StageEvent = {
    ...event,
    seq: record.events.length,
    at: new Date().toISOString(),
  }

  record.events.push(full)
  for (const sub of subscribers.get(record.id) ?? []) sub.onEvent(full)

  return full
}

export function finish(
  record: ApplicationRecord,
  result: ApplicationResult
): void {
  record.result = result
  record.status = result.status
  record.done = true
  for (const sub of subscribers.get(record.id) ?? []) sub.onDone()
}
