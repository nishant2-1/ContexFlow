import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient
} from "@aws-sdk/client-sqs";
import { Job, Queue, Worker } from "bullmq";
import { Consumer, Kafka, Producer } from "kafkajs";
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

class SqsWorkflowQueue implements WorkflowQueue {
  private readonly client: SQSClient;
  private readonly queueUrls: string[];
  private running = true;
  private readonly pollers: Array<Promise<void>>;

  constructor(
    queueUrls: string[],
    private readonly handler: (event: TriggerEvent) => Promise<void>
  ) {
    this.client = new SQSClient({ region: env.AWS_REGION });
    this.queueUrls = queueUrls;
    this.pollers = this.queueUrls.map((queueUrl) => this.pollQueue(queueUrl));
  }

  async enqueue(event: TriggerEvent): Promise<void> {
    const body = JSON.stringify({
      ...event,
      transportRegion: env.DEPLOY_REGION,
      enqueuedAt: new Date().toISOString()
    });

    await Promise.all(
      this.queueUrls.map((queueUrl) => {
        const input: {
          QueueUrl: string;
          MessageBody: string;
          MessageDeduplicationId?: string;
          MessageGroupId?: string;
        } = {
          QueueUrl: queueUrl,
          MessageBody: body
        };

        if (queueUrl.endsWith(".fifo")) {
          input.MessageDeduplicationId = event.eventId;
          input.MessageGroupId = "contextflow-workflow";
        }

        return this.client.send(new SendMessageCommand(input));
      })
    );
  }

  async shutdown(): Promise<void> {
    this.running = false;
    await Promise.allSettled(this.pollers);
  }

  private async pollQueue(queueUrl: string): Promise<void> {
    while (this.running) {
      try {
        const response = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: env.SQS_MAX_MESSAGES,
            WaitTimeSeconds: env.SQS_WAIT_TIME_SECONDS,
            VisibilityTimeout: 30
          })
        );

        if (!response.Messages || response.Messages.length === 0) {
          continue;
        }

        for (const message of response.Messages) {
          if (!message.Body) {
            continue;
          }

          try {
            const event = JSON.parse(message.Body) as TriggerEvent;
            await this.handler(event);

            if (message.ReceiptHandle) {
              await this.client.send(
                new DeleteMessageCommand({
                  QueueUrl: queueUrl,
                  ReceiptHandle: message.ReceiptHandle
                })
              );
            }
          } catch (error) {
            logger.error({ error, queueUrl }, "SQS worker failed processing message");
          }
        }
      } catch (error) {
        logger.error({ error, queueUrl }, "SQS polling failed");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}

class KafkaWorkflowQueue implements WorkflowQueue {
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private readonly consumer: Consumer;
  private readonly topics: string[];
  private readonly ready: Promise<void>;

  constructor(
    brokers: string[],
    topics: string[],
    private readonly handler: (event: TriggerEvent) => Promise<void>
  ) {
    this.kafka = new Kafka({
      clientId: `contextflow-${env.DEPLOY_REGION}`,
      brokers
    });

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({
      groupId: `${env.KAFKA_GROUP_ID}-${env.DEPLOY_REGION}`
    });
    this.topics = [...new Set(topics)];
    this.ready = this.initialize();
  }

  async enqueue(event: TriggerEvent): Promise<void> {
    await this.ready;

    const payload = JSON.stringify({
      ...event,
      transportRegion: env.DEPLOY_REGION,
      enqueuedAt: new Date().toISOString()
    });

    await Promise.all(
      this.topics.map((topic) =>
        this.producer.send({
          topic,
          messages: [{ key: event.eventId, value: payload }]
        })
      )
    );
  }

  async shutdown(): Promise<void> {
    await this.ready;
    await this.consumer.disconnect();
    await this.producer.disconnect();
  }

  private async initialize(): Promise<void> {
    await this.producer.connect();
    await this.consumer.connect();

    await Promise.all(this.topics.map((topic) => this.consumer.subscribe({ topic }))); 

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) {
          return;
        }

        try {
          const event = JSON.parse(message.value.toString()) as TriggerEvent;
          await this.handler(event);
        } catch (error) {
          logger.error({ error, topic }, "Kafka worker failed processing message");
        }
      }
    });
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
  if (env.QUEUE_DRIVER === "sqs") {
    const queueUrls = parseCsv(env.SQS_QUEUE_URLS);
    if (queueUrls.length > 0) {
      logger.info({ driver: "sqs", queueCount: queueUrls.length }, "Using SQS workflow queue");
      return new SqsWorkflowQueue(queueUrls, handler);
    }

    logger.warn("QUEUE_DRIVER=sqs but SQS_QUEUE_URLS is empty, falling back to inline queue");
  }

  if (env.QUEUE_DRIVER === "kafka") {
    const brokers = parseCsv(env.KAFKA_BROKERS);
    if (brokers.length > 0) {
      const topics = [env.KAFKA_TOPIC, ...parseCsv(env.KAFKA_REPLICA_TOPICS)];
      logger.info({ driver: "kafka", brokers, topics }, "Using Kafka workflow queue");
      return new KafkaWorkflowQueue(brokers, topics, handler);
    }

    logger.warn("QUEUE_DRIVER=kafka but KAFKA_BROKERS is empty, falling back to inline queue");
  }

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

function parseCsv(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
