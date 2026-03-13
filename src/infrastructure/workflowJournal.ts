import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { env } from "../config/env";
import { WorkflowRunRecord } from "../types/events";

const journalPath = path.resolve(process.cwd(), env.WORKFLOW_RUN_LOG_PATH);

class WorkflowJournal {
  append(record: WorkflowRunRecord): void {
    mkdirSync(path.dirname(journalPath), { recursive: true });
    appendFileSync(journalPath, `${JSON.stringify(record)}\n`, "utf8");
  }

  loadRecent(limit = 200): WorkflowRunRecord[] {
    if (!existsSync(journalPath)) {
      return [];
    }

    const lines = readFileSync(journalPath, "utf8").split("\n").filter(Boolean);
    const parsed = lines
      .slice(-Math.max(limit, 1))
      .map((line) => {
        try {
          return JSON.parse(line) as WorkflowRunRecord;
        } catch {
          return null;
        }
      })
      .filter((row): row is WorkflowRunRecord => row !== null);

    return parsed;
  }
}

export const workflowJournal = new WorkflowJournal();
