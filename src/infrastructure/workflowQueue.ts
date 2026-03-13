import { Job, Queue, Worker } from "bullmq";
import { env } from "../config/env";
import { TriggerEvent } from "../types/events";
import { logger } from "../utils/logger";

export interface WorkflowQueue {
  enqueue(event: TriggerEvent): Promise<void>;
  shutdown(): Promise<void>;
}

class InlineWorkflowQueue implements WorkflowQueue {
  constructor(private readonly handler: (event: TriggerEvent) => Promise<void>) {}

  async enqueue(event: TriggerEvent): Promise<void> {
    setImmediate(() => {
      void this.handler(event);
    });
  }

  async shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

class BullMqWorkflowQueue implements WorkflowQueue {
  private readonly queue: Queue<TriggerEvent>;
  private readonly worker: Worker<TriggerEvent>;

  constructor(redisUrl: string, private readonly handler: (event: TriggerEvent) => Promise<void>) {
    const connection = toBullMqConnection(redisUrl);

    this.queue = new Queue<TriggerEvent>("contextflow-workflow", {
      connection
    });

    this.worker = new Worker<TriggerEvent>(
      "contextflow-workflow",
      async (job: Job<TriggerEvent>) => {
        await this.handler(job.data);
      },
      {
        connection,
        concurrency: env.QUEUE_CONCURRENCY
      }
    );

    this.worker.on("failed", (job, error) => {
      logger.error({ jobId: job?.id, error }, "BullMQ worker job failed");
    });
  }

  async enqueue(event: TriggerEvent): Promise<void> {
    await this.queue.add("trigger-event", event, {
      jobId: event.eventId,
      attempts: env.QUEUE_ATTEMPTS,
      backoff: {
        type: "exponential",
        delay: 1000
      },
      removeOnComplete: true,
      removeOnFail: false
    });
  }

  async shutdown(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

function toBullMqConnection(redisUrl: string): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
} {
  const parsed = new URL(redisUrl);

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  };
}

export function createWorkflowQueue(
  handler: (event: TriggerEvent) => Promise<void>
): WorkflowQueue {
  if (env.QUEUE_DRIVER === "bullmq" && env.REDIS_URL) {
    try {
      logger.info({ driver: "bullmq" }, "Using BullMQ workflow queue");
      return new BullMqWorkflowQueue(env.REDIS_URL, handler);
    } catch (error) {
      logger.warn({ error }, "BullMQ setup failed, falling back to inline queue");
    }
  }

  logger.info({ driver: "inline" }, "Using inline workflow queue");
  return new InlineWorkflowQueue(handler);
}
