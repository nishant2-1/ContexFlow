import axios from "axios";
import { env } from "../../config/env";

export interface JiraIssueInput {
  title: string;
  description: string;
  dueIso: string | null;
  labels: string[];
}

export interface JiraIssueResult {
  id: string;
  key: string;
  url: string;
}

export class JiraClient {
  async createIssue(input: JiraIssueInput): Promise<JiraIssueResult> {
    if (!this.hasConfig()) {
      const stamp = Date.now();
      return {
        id: `mock-jira-${stamp}`,
        key: `CTX-${stamp}`,
        url: `${env.BASE_URL}/mock/jira/${stamp}`
      };
    }

    const baseUrl = env.JIRA_BASE_URL as string;
    const auth = Buffer.from(`${env.JIRA_USER_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");

    const response = await axios.post(
      `${baseUrl.replace(/\/$/, "")}/rest/api/2/issue`,
      {
        fields: {
          project: { key: env.JIRA_PROJECT_KEY },
          summary: input.title,
          description: input.description,
          issuetype: { name: env.JIRA_ISSUE_TYPE },
          labels: input.labels,
          duedate: input.dueIso ? input.dueIso.slice(0, 10) : undefined
        }
      },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );

    const issue = response.data as { id: string; key: string };

    return {
      id: issue.id,
      key: issue.key,
      url: `${baseUrl.replace(/\/$/, "")}/browse/${issue.key}`
    };
  }

  private hasConfig(): boolean {
    return Boolean(
      env.JIRA_BASE_URL &&
        env.JIRA_USER_EMAIL &&
        env.JIRA_API_TOKEN &&
        env.JIRA_PROJECT_KEY &&
        env.JIRA_ISSUE_TYPE
    );
  }
}

export const jiraClient = new JiraClient();
