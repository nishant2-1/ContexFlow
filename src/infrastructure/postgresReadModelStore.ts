import { Pool } from "pg";
import { env } from "../config/env";
import {
  ApprovalRequest,
  ApprovalStatus,
  SourcePlatform,
  WorkflowRunRecord
} from "../types/events";
import { logger } from "../utils/logger";

interface PersistedLifecycleEvent {
  eventId: string;
  source: SourcePlatform;
  workspaceId: string | null;
  eventType: string;
  payload: unknown;
}

class PostgresReadModelStore {
  private readonly pool: Pool | null;

  constructor() {
    if (env.PERSISTENCE_DRIVER === "postgres" && env.POSTGRES_URL) {
      this.pool = new Pool({ connectionString: env.POSTGRES_URL });
      return;
    }

    this.pool = null;
  }

  get enabled(): boolean {
    return this.pool !== null;
  }

  async init(): Promise<void> {
    if (!this.pool) {
      logger.info({ driver: env.PERSISTENCE_DRIVER }, "Postgres read model store disabled");
      return;
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_events (
        id BIGSERIAL PRIMARY KEY,
        event_id TEXT NOT NULL,
        source TEXT NOT NULL,
        workspace_id TEXT,
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_workflow_events_event_id ON workflow_events(event_id);");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_workflow_events_created_at ON workflow_events(created_at DESC);");

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_run_read_models (
        event_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        workspace_id TEXT,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        simulated BOOLEAN NOT NULL,
        latency_ms INTEGER,
        ticket_url TEXT,
        issue_provider TEXT,
        priority TEXT,
        summary TEXT,
        reason TEXT
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_approvals (
        approval_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        source TEXT NOT NULL,
        workspace_id TEXT,
        status TEXT NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL,
        decided_at TIMESTAMPTZ,
        requested_by TEXT,
        decided_by TEXT,
        reason TEXT,
        event_payload JSONB NOT NULL,
        task_payload JSONB NOT NULL,
        conversation TEXT NOT NULL,
        issue_provider_override TEXT
      );
    `);

    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_workflow_approvals_status ON workflow_approvals(status);");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_workflow_approvals_requested_at ON workflow_approvals(requested_at DESC);");

    logger.info("Postgres read model store initialized");
  }

  async appendLifecycleEvent(event: PersistedLifecycleEvent): Promise<void> {
    if (!this.pool) {
      return;
    }

    try {
      await this.pool.query(
        `
          INSERT INTO workflow_events (event_id, source, workspace_id, event_type, payload)
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [
          event.eventId,
          event.source,
          event.workspaceId,
          event.eventType,
          JSON.stringify(event.payload ?? {})
        ]
      );
    } catch (error) {
      logger.warn({ error, eventId: event.eventId, eventType: event.eventType }, "Failed to append workflow lifecycle event");
    }
  }

  async upsertRun(record: WorkflowRunRecord): Promise<void> {
    if (!this.pool) {
      return;
    }

    try {
      await this.pool.query(
        `
          INSERT INTO workflow_run_read_models (
            event_id,
            source,
            workspace_id,
            status,
            created_at,
            updated_at,
            simulated,
            latency_ms,
            ticket_url,
            issue_provider,
            priority,
            summary,
            reason
          )
          VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (event_id)
          DO UPDATE SET
            source = EXCLUDED.source,
            workspace_id = EXCLUDED.workspace_id,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at,
            simulated = EXCLUDED.simulated,
            latency_ms = EXCLUDED.latency_ms,
            ticket_url = EXCLUDED.ticket_url,
            issue_provider = EXCLUDED.issue_provider,
            priority = EXCLUDED.priority,
            summary = EXCLUDED.summary,
            reason = EXCLUDED.reason
        `,
        [
          record.eventId,
          record.source,
          record.workspaceId,
          record.status,
          record.createdAt,
          record.updatedAt,
          record.simulated,
          record.latencyMs,
          record.ticketUrl,
          record.issueProvider,
          record.priority,
          record.summary,
          record.reason
        ]
      );
    } catch (error) {
      logger.warn({ error, eventId: record.eventId }, "Failed to upsert workflow run read model");
    }
  }

  async listRuns(limit = 25): Promise<WorkflowRunRecord[] | null> {
    if (!this.pool) {
      return null;
    }

    try {
      const response = await this.pool.query(
        `
          SELECT
            event_id,
            source,
            workspace_id,
            status,
            created_at,
            updated_at,
            simulated,
            latency_ms,
            ticket_url,
            issue_provider,
            priority,
            summary,
            reason
          FROM workflow_run_read_models
          ORDER BY updated_at DESC
          LIMIT $1
        `,
        [Math.max(limit, 1)]
      );

      return response.rows.map((row) => this.mapRunRow(row));
    } catch (error) {
      logger.warn({ error }, "Failed to list workflow runs from Postgres");
      return null;
    }
  }

  async upsertApproval(request: ApprovalRequest): Promise<void> {
    if (!this.pool) {
      return;
    }

    try {
      await this.pool.query(
        `
          INSERT INTO workflow_approvals (
            approval_id,
            event_id,
            source,
            workspace_id,
            status,
            requested_at,
            decided_at,
            requested_by,
            decided_by,
            reason,
            event_payload,
            task_payload,
            conversation,
            issue_provider_override
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6::timestamptz,
            $7::timestamptz,
            $8,
            $9,
            $10,
            $11::jsonb,
            $12::jsonb,
            $13,
            $14
          )
          ON CONFLICT (approval_id)
          DO UPDATE SET
            status = EXCLUDED.status,
            decided_at = EXCLUDED.decided_at,
            requested_by = EXCLUDED.requested_by,
            decided_by = EXCLUDED.decided_by,
            reason = EXCLUDED.reason,
            event_payload = EXCLUDED.event_payload,
            task_payload = EXCLUDED.task_payload,
            conversation = EXCLUDED.conversation,
            issue_provider_override = EXCLUDED.issue_provider_override
        `,
        [
          request.approvalId,
          request.event.eventId,
          request.event.source,
          request.event.workspaceId ?? null,
          request.status,
          request.requestedAt,
          request.decidedAt,
          request.requestedBy,
          request.decidedBy,
          request.reason,
          JSON.stringify(request.event),
          JSON.stringify(request.task),
          request.conversation,
          request.issueProviderOverride
        ]
      );
    } catch (error) {
      logger.warn({ error, approvalId: request.approvalId }, "Failed to upsert approval read model");
    }
  }

  async listApprovals(status?: ApprovalStatus, limit = 50): Promise<ApprovalRequest[] | null> {
    if (!this.pool) {
      return null;
    }

    try {
      const params: Array<string | number> = [];
      const where = status
        ? (() => {
            params.push(status);
            return "WHERE status = $1";
          })()
        : "";

      params.push(Math.max(limit, 1));
      const limitParamPosition = params.length;

      const response = await this.pool.query(
        `
          SELECT
            approval_id,
            event_id,
            source,
            workspace_id,
            status,
            requested_at,
            decided_at,
            requested_by,
            decided_by,
            reason,
            event_payload,
            task_payload,
            conversation,
            issue_provider_override
          FROM workflow_approvals
          ${where}
          ORDER BY requested_at DESC
          LIMIT $${limitParamPosition}
        `,
        params
      );

      return response.rows.map((row) => this.mapApprovalRow(row));
    } catch (error) {
      logger.warn({ error }, "Failed to list approvals from Postgres");
      return null;
    }
  }

  async getApproval(approvalId: string): Promise<ApprovalRequest | null> {
    if (!this.pool) {
      return null;
    }

    try {
      const response = await this.pool.query(
        `
          SELECT
            approval_id,
            event_id,
            source,
            workspace_id,
            status,
            requested_at,
            decided_at,
            requested_by,
            decided_by,
            reason,
            event_payload,
            task_payload,
            conversation,
            issue_provider_override
          FROM workflow_approvals
          WHERE approval_id = $1
          LIMIT 1
        `,
        [approvalId]
      );

      if (response.rows.length === 0) {
        return null;
      }

      return this.mapApprovalRow(response.rows[0]);
    } catch (error) {
      logger.warn({ error, approvalId }, "Failed to get approval from Postgres");
      return null;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.end();
  }

  private mapRunRow(row: Record<string, unknown>): WorkflowRunRecord {
    return {
      eventId: String(row.event_id),
      source: row.source as SourcePlatform,
      workspaceId: row.workspace_id === null ? null : String(row.workspace_id),
      status: String(row.status) as WorkflowRunRecord["status"],
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
      simulated: Boolean(row.simulated),
      latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
      ticketUrl: row.ticket_url === null ? null : String(row.ticket_url),
      issueProvider:
        row.issue_provider === null ? null : (String(row.issue_provider) as WorkflowRunRecord["issueProvider"]),
      priority: row.priority === null ? null : (String(row.priority) as WorkflowRunRecord["priority"]),
      summary: row.summary === null ? null : String(row.summary),
      reason: row.reason === null ? null : String(row.reason)
    };
  }

  private mapApprovalRow(row: Record<string, unknown>): ApprovalRequest {
    return {
      approvalId: String(row.approval_id),
      event: row.event_payload as ApprovalRequest["event"],
      task: row.task_payload as ApprovalRequest["task"],
      conversation: String(row.conversation),
      issueProviderOverride:
        row.issue_provider_override === null
          ? null
          : (String(row.issue_provider_override) as ApprovalRequest["issueProviderOverride"]),
      status: String(row.status) as ApprovalStatus,
      requestedAt: this.toIso(row.requested_at),
      decidedAt: row.decided_at === null ? null : this.toIso(row.decided_at),
      requestedBy: row.requested_by === null ? null : String(row.requested_by),
      decidedBy: row.decided_by === null ? null : String(row.decided_by),
      reason: row.reason === null ? null : String(row.reason)
    };
  }

  private toIso(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return new Date(String(value)).toISOString();
  }
}

export const postgresReadModelStore = new PostgresReadModelStore();
