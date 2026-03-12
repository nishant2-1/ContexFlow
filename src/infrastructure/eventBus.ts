import { EventEmitter } from "node:events";
import { TriggerEvent } from "../types/events";

class WorkflowEventBus extends EventEmitter {
  emitIngested(event: TriggerEvent): void {
    this.emit("event.ingested", event);
  }

  onIngested(listener: (event: TriggerEvent) => void): void {
    this.on("event.ingested", listener);
  }
}

export const workflowEventBus = new WorkflowEventBus();
