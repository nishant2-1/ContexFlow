import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const boolString = z
  .enum(["true", "false"])
  .optional()
  .default("true")
  .transform((value) => value === "true");

const baseUrlSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return "http://localhost:3000";
    }

    const trimmed = value.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    return `http://${trimmed}`;
  },
  z.string().min(1)
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  BASE_URL: baseUrlSchema,
  PERSISTENCE_DRIVER: z.enum(["file", "postgres"]).default("file"),
  POSTGRES_URL: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_WORKSPACE_ID: z.string().optional(),
  DISCORD_WEBHOOK_SECRET: z.string().optional(),
  AI_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  MOCK_AI: boolString,
  MOCK_ISSUE: boolString,
  ISSUE_PROVIDER: z.enum(["trello", "jira"]).default("trello"),
  TRELLO_API_KEY: z.string().optional(),
  TRELLO_TOKEN: z.string().optional(),
  TRELLO_LIST_ID: z.string().optional(),
  JIRA_BASE_URL: z.string().optional(),
  JIRA_USER_EMAIL: z.string().optional(),
  JIRA_API_TOKEN: z.string().optional(),
  JIRA_PROJECT_KEY: z.string().optional(),
  JIRA_ISSUE_TYPE: z.string().default("Task"),
  ENABLE_DISCORD: boolString,
  ENABLE_SLACK: boolString,
  APPROVAL_MODE: z.enum(["off", "always", "high-risk"]).default("off"),
  APPROVAL_MIN_PRIORITY: z.enum(["low", "medium", "high", "critical"]).default("high"),
  REQUIRED_REACTION: z.string().default("white_check_mark"),
  PIPELINE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  MAX_MESSAGES_FOR_CONTEXT: z.coerce.number().int().positive().max(100).default(30),
  QUEUE_DRIVER: z.enum(["inline", "bullmq", "sqs", "kafka"]).default("inline"),
  DEPLOY_REGION: z.string().default("local"),
  REDIS_URL: z.string().optional(),
  QUEUE_CONCURRENCY: z.coerce.number().int().positive().max(50).default(4),
  QUEUE_ATTEMPTS: z.coerce.number().int().positive().max(10).default(3),
  AWS_REGION: z.string().default("us-east-1"),
  SQS_QUEUE_URLS: z.string().optional(),
  SQS_MAX_MESSAGES: z.coerce.number().int().positive().max(10).default(5),
  SQS_WAIT_TIME_SECONDS: z.coerce.number().int().min(1).max(20).default(10),
  KAFKA_BROKERS: z.string().optional(),
  KAFKA_TOPIC: z.string().default("contextflow-workflow-events"),
  KAFKA_REPLICA_TOPICS: z.string().optional(),
  KAFKA_GROUP_ID: z.string().default("contextflow-workers"),
  WORKSPACE_POLICY_FILE: z.string().default("data/workspace-policies.json"),
  WORKFLOW_RUN_LOG_PATH: z.string().default("data/workflow-runs.jsonl"),
  OPS_VIEWER_API_KEY: z.string().optional(),
  OPS_ADMIN_API_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);
