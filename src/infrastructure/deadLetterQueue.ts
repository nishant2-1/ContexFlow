import { promises as fs } from "node:fs";
import path from "node:path";

export interface DeadLetterRecord {
  eventId: string;
  source: "slack" | "discord";
  stage: string;
  reason: string;
  payload: unknown;
  createdAt: string;
}

const deadLetterFilePath = path.resolve(process.cwd(), "data/dead-letter.jsonl");

export class DeadLetterQueue {
  private cache = new Map<string, DeadLetterRecord>();

  async enqueue(record: DeadLetterRecord): Promise<void> {
    this.cache.set(record.eventId, record);

    try {
      await fs.mkdir(path.dirname(deadLetterFilePath), { recursive: true });
      await fs.appendFile(deadLetterFilePath, `${JSON.stringify(record)}\n`, "utf8");
    } catch {
      // Serverless platforms may not provide persistent writable disk.
    }
  }

  async list(limit = 50): Promise<DeadLetterRecord[]> {
    try {
      const raw = await fs.readFile(deadLetterFilePath, "utf8");
      const rows = raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as DeadLetterRecord);

      rows.forEach((row) => this.cache.set(row.eventId, row));
      return rows.slice(-limit).reverse();
    } catch {
      return [];
    }
  }

  async get(eventId: string): Promise<DeadLetterRecord | null> {
    const cached = this.cache.get(eventId);
    if (cached) {
      return cached;
    }

    const rows = await this.list(500);
    return rows.find((row) => row.eventId === eventId) ?? null;
  }
}

export const deadLetterQueue = new DeadLetterQueue();
