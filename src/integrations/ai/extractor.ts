import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { extractedTaskSchema, ExtractedTask } from "../../domain/task";
import { env } from "../../config/env";
import { inferPriority } from "../../services/priority.service";
import { logger } from "../../utils/logger";

const systemPrompt = `You are an operations analyst. Convert noisy engineering chat context into a structured task.
Rules:
1) Summary must be exactly 2 concise sentences.
2) title should be imperative and specific.
3) deadlineIso must be null if unknown, otherwise ISO-8601.
4) priority must be low|medium|high|critical.
5) confidence should be between 0 and 1.`;

export class AiExtractor {
  async extractTask(conversation: string): Promise<ExtractedTask> {
    if (env.MOCK_AI || (!env.OPENAI_API_KEY && !env.GOOGLE_API_KEY)) {
      return this.extractFallback(conversation);
    }

    try {
      if (env.AI_PROVIDER === "gemini" && env.GOOGLE_API_KEY) {
        const model = new ChatGoogleGenerativeAI({
          model: "gemini-1.5-pro",
          apiKey: env.GOOGLE_API_KEY,
          temperature: 0.2
        });

        const structured = model.withStructuredOutput(extractedTaskSchema);
        return this.normalize(await structured.invoke(`${systemPrompt}\n\n${conversation}`));
      }

      if (env.OPENAI_API_KEY) {
        const model = new ChatOpenAI({
          model: "gpt-4o-mini",
          apiKey: env.OPENAI_API_KEY,
          temperature: 0.2
        });

        const structured = model.withStructuredOutput(extractedTaskSchema);
        return this.normalize(await structured.invoke(`${systemPrompt}\n\n${conversation}`));
      }

      return this.extractFallback(conversation);
    } catch (error) {
      logger.warn({ error }, "AI extraction failed, falling back to deterministic parser");
      return this.extractFallback(conversation);
    }
  }

  private normalize(task: ExtractedTask): ExtractedTask {
    const parsed = extractedTaskSchema.parse(task);

    const deadlineIso = parsed.deadlineIso ? new Date(parsed.deadlineIso).toISOString() : null;
    const summarySentences = parsed.summary
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(" ");

    return {
      ...parsed,
      summary: summarySentences,
      deadlineIso
    };
  }

  private extractFallback(conversation: string): ExtractedTask {
    const compact = conversation.replace(/\s+/g, " ").trim();
    const sentences = compact.split(/(?<=[.!?])\s+/).filter(Boolean);

    const summary =
      sentences.length >= 2 ? `${sentences[0]} ${sentences[1]}` : `${compact.slice(0, 180)}.`;

    const assigneeMatch = compact.match(/@([a-zA-Z0-9._-]+)/);
    const dateMatch = compact.match(/(20\d{2}-\d{2}-\d{2})/);

    const actionItems = conversation
      .split("\n")
      .map((line) => line.replace(/^\[\d+\]\s*/, "").trim())
      .filter((line) => /^(-|\*|\d+\.)\s+/.test(line) || /\b(need to|must|todo|action)\b/i.test(line))
      .slice(0, 5)
      .map((line) => line.replace(/^(-|\*|\d+\.)\s+/, ""));

    const fallback: ExtractedTask = {
      title: compact.split(" ").slice(0, 10).join(" ").slice(0, 100) || "Follow up on conversation",
      summary,
      assignee: assigneeMatch ? assigneeMatch[1] : null,
      deadlineIso: dateMatch ? new Date(`${dateMatch[1]}T17:00:00.000Z`).toISOString() : null,
      priority: inferPriority(compact),
      actionItems: actionItems.length > 0 ? actionItems : ["Clarify ownership and next delivery step"],
      confidence: 0.62
    };

    return extractedTaskSchema.parse(fallback);
  }
}

export const aiExtractor = new AiExtractor();
