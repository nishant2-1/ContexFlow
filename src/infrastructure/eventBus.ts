import { EventEmitter } from "node:events";
import {
  ApprovalRequest,
  TriggerEvent,
  WorkflowFailureEvent,
  WorkflowResult
} from "../types/events";

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

  emitAwaitingApproval(approval: ApprovalRequest): void {
    this.emit("event.awaiting_approval", approval);
  }

  onAwaitingApproval(listener: (approval: ApprovalRequest) => void): void {
    this.on("event.awaiting_approval", listener);
  }

  emitApprovalApproved(approval: ApprovalRequest): void {
    this.emit("event.approval_approved", approval);
  }

  onApprovalApproved(listener: (approval: ApprovalRequest) => void): void {
    this.on("event.approval_approved", listener);
  }

  emitApprovalRejected(approval: ApprovalRequest): void {
    this.emit("event.approval_rejected", approval);
  }

  onApprovalRejected(listener: (approval: ApprovalRequest) => void): void {
    this.on("event.approval_rejected", listener);
  }
}

export const workflowEventBus = new WorkflowEventBus();
