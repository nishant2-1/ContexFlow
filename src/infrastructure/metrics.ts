export interface MetricsSnapshot {
  ingestedEvents: number;
  processedEvents: number;
  failedEvents: number;
  duplicateEvents: number;
  ticketsCreated: number;
  averageLatencyMs: number;
  lastProcessedAt: string | null;
}

class MetricsStore {
  private ingestedEvents = 0;
  private processedEvents = 0;
  private failedEvents = 0;
  private duplicateEvents = 0;
  private ticketsCreated = 0;
  private latencyTotal = 0;
  private lastProcessedAt: string | null = null;

  incrementIngested(): void {
    this.ingestedEvents += 1;
  }

  incrementProcessed(latencyMs: number): void {
    this.processedEvents += 1;
    this.latencyTotal += latencyMs;
    this.lastProcessedAt = new Date().toISOString();
  }

  incrementFailed(): void {
    this.failedEvents += 1;
  }

  incrementDuplicate(): void {
    this.duplicateEvents += 1;
  }

  incrementTickets(): void {
    this.ticketsCreated += 1;
  }

  snapshot(): MetricsSnapshot {
    return {
      ingestedEvents: this.ingestedEvents,
      processedEvents: this.processedEvents,
      failedEvents: this.failedEvents,
      duplicateEvents: this.duplicateEvents,
      ticketsCreated: this.ticketsCreated,
      averageLatencyMs:
        this.processedEvents === 0 ? 0 : Math.round(this.latencyTotal / this.processedEvents),
      lastProcessedAt: this.lastProcessedAt
    };
  }
}

export const metricsStore = new MetricsStore();
