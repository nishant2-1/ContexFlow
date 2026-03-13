import { jiraClient } from "../jira/jiraClient";
import { trelloClient } from "../trello/trelloClient";
import { env } from "../../config/env";

export type IssueProviderName = "trello" | "jira";

export interface IssueTicketInput {
  title: string;
  description: string;
  dueIso: string | null;
  priority: "low" | "medium" | "high" | "critical";
}

export interface IssueTicketResult {
  id: string;
  url: string;
  provider: IssueProviderName;
}

export async function createIssueTicket(
  input: IssueTicketInput,
  providerOverride?: IssueProviderName
): Promise<IssueTicketResult> {
  const provider = providerOverride ?? env.ISSUE_PROVIDER;

  if (provider === "jira") {
    const issue = await jiraClient.createIssue({
      title: input.title,
      description: input.description,
      dueIso: input.dueIso,
      labels: [input.priority, "contextflow"]
    });

    return {
      id: issue.id,
      url: issue.url,
      provider: "jira"
    };
  }

  const card = await trelloClient.createCard({
    name: input.title,
    desc: input.description,
    due: input.dueIso,
    labels: [input.priority]
  });

  return {
    id: card.id,
    url: card.url,
    provider: "trello"
  };
}
