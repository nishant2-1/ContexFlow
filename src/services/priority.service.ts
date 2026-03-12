export function inferPriority(text: string): "low" | "medium" | "high" | "critical" {
  const normalized = text.toLowerCase();

  if (/(outage|production down|critical|sev1|blocker|immediately)/.test(normalized)) {
    return "critical";
  }

  if (/(urgent|asap|today|high priority|blocking)/.test(normalized)) {
    return "high";
  }

  if (/(soon|tomorrow|next sprint|important)/.test(normalized)) {
    return "medium";
  }

  return "low";
}
