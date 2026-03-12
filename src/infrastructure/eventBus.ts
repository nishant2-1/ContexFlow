import { EventEmitter } from "node:events";
import { TriggerEvent, WorkflowFailureEvent, WorkflowResult } from "../types/events";

class WorkflowEventBus extends EventEmitter {
  emitIngested(event: TriggerEvent): void {
    this.emit("event.ingested", event);
  }

  onIngested(listener: (event: TriggerEvent) => void): void {
    this.on("event.ingested", listener);
  }

  emitProcessing(event: TriggerEvent): void {
    this.emit("event.processing", event);
  }

  onProcessing(listener: (event: TriggerEvent) => void): void {
    this.on("event.processing", listener);
  }

  emitSucceeded(result: WorkflowResult): void {
    this.emit("event.succeeded", result);
  }

  onSucceeded(listener: (result: WorkflowResult) => void): void {
    this.on("event.succeeded", listener);
  }

  emitFailed(failure: WorkflowFailureEvent): void {
    this.emit("event.failed", failure);
  }

  onFailed(listener: (failure: WorkflowFailureEvent) => void): void {
    this.on("event.failed", listener);
  }

  emitDuplicate(event: TriggerEvent): void {
    this.emit("event.duplicate", event);
  }

  onDuplicate(listener: (event: TriggerEvent) => void): void {
    this.on("event.duplicate", listener);
  }
}

export const workflowEventBus = new WorkflowEventBus();
