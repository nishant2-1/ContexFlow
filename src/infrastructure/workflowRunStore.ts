import { TriggerEvent, WorkflowFailureEvent, WorkflowResult, WorkflowRunRecord } from "../types/events";
import { workflowJournal } from "./workflowJournal";

class WorkflowRunStore {
  private readonly store = new Map<string, WorkflowRunRecord>();

  constructor(private readonly maxRecords = 500) {
    const historical = workflowJournal.loadRecent(maxRecords);
    historical.forEach((record) => {
      this.store.set(record.eventId, record);
    });
  }

  markIngested(event: TriggerEvent): void {
    const existing = this.store.get(event.eventId);
    const now = new Date().toISOString();

    this.store.set(event.eventId, {
      eventId: event.eventId,
      source: event.source,
      status: "ingested",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      simulated: this.isSimulated(event),
      latencyMs: existing?.latencyMs ?? null,
      ticketUrl: existing?.ticketUrl ?? null,
      issueProvider: existing?.issueProvider ?? null,
      priority: existing?.priority ?? null,
      summary: existing?.summary ?? null,
      reason: existing?.reason ?? null
    });

    this.persist(event.eventId);

    this.prune();
  }

  markProcessing(eventId: string): void {
    const record = this.store.get(eventId);
    if (!record) {
      return;
    }

    this.store.set(eventId, {
      ...record,
      status: "processing",
      updatedAt: new Date().toISOString()
    });

    this.persist(eventId);
  }

  markDuplicate(eventId: string): void {
    const record = this.store.get(eventId);
    if (!record) {
      return;
    }

    this.store.set(eventId, {
      ...record,
      status: "duplicate",
      updatedAt: new Date().toISOString()
    });

    this.persist(eventId);
  }

  markSucceeded(result: WorkflowResult): void {
    const record = this.store.get(result.eventId);
    if (!record) {
      return;
    }

    this.store.set(result.eventId, {
      ...record,
      status: "succeeded",
      updatedAt: new Date().toISOString(),
      latencyMs: result.latencyMs,
      ticketUrl: result.ticketUrl,
      issueProvider: result.issueProvider,
      priority: result.task.priority,
      summary: result.task.summary,
      reason: null
    });

    this.persist(result.eventId);
  }

  markFailed(failure: WorkflowFailureEvent): void {
    const record = this.store.get(failure.eventId);
    if (!record) {
      return;
    }

    this.store.set(failure.eventId, {
      ...record,
      status: "failed",
      updatedAt: new Date().toISOString(),
      reason: failure.reason
    });

    this.persist(failure.eventId);
  }

  list(limit = 25): WorkflowRunRecord[] {
    return [...this.store.values()]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, limit);
  }

  private prune(): void {
    if (this.store.size <= this.maxRecords) {
      return;
    }

    const oldest = [...this.store.values()].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
    )[0];

    if (oldest) {
      this.store.delete(oldest.eventId);
    }
  }

  private isSimulated(event: TriggerEvent): boolean {
    if (!event.rawPayload || typeof event.rawPayload !== "object") {
      return false;
    }

    const payload = event.rawPayload as Record<string, unknown>;
    return payload.simulated === true;
  }

  private persist(eventId: string): void {
    const record = this.store.get(eventId);
    if (!record) {
      return;
    }

    workflowJournal.append(record);
  }
}

export const workflowRunStore = new WorkflowRunStore();
