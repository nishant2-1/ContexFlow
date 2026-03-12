import { z } from "zod";

export const prioritySchema = z.enum(["low", "medium", "high", "critical"]);

export const extractedTaskSchema = z.object({
  title: z.string().min(5).max(120),
  summary: z.string().min(10).max(400),
  assignee: z.string().nullable(),
  deadlineIso: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .or(z.string().datetime().nullable()),
  priority: prioritySchema,
  actionItems: z.array(z.string().min(3).max(180)).max(6),
  confidence: z.number().min(0).max(1)
});

export type ExtractedTask = z.infer<typeof extractedTaskSchema>;
