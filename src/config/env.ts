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
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_WORKSPACE_ID: z.string().optional(),
  DISCORD_WEBHOOK_SECRET: z.string().optional(),
  AI_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  MOCK_AI: boolString,
  TRELLO_API_KEY: z.string().optional(),
  TRELLO_TOKEN: z.string().optional(),
  TRELLO_LIST_ID: z.string().optional(),
  ENABLE_DISCORD: boolString,
  ENABLE_SLACK: boolString,
  REQUIRED_REACTION: z.string().default("white_check_mark"),
  PIPELINE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  MAX_MESSAGES_FOR_CONTEXT: z.coerce.number().int().positive().max(100).default(30)
});

export const env = envSchema.parse(process.env);
