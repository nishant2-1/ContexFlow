import axios from "axios";
import { env } from "../../config/env";

const trelloBaseUrl = "https://api.trello.com/1";

export interface TrelloCardInput {
  name: string;
  desc: string;
  due: string | null;
  labels: string[];
}

export interface TrelloCardResult {
  id: string;
  url: string;
}

export class TrelloClient {
  async createCard(input: TrelloCardInput): Promise<TrelloCardResult> {
    if (!env.TRELLO_API_KEY || !env.TRELLO_TOKEN || !env.TRELLO_LIST_ID) {
      return {
        id: `mock-${Date.now()}`,
        url: `${env.BASE_URL}/mock/trello/${Date.now()}`
      };
    }

    const params = {
      key: env.TRELLO_API_KEY,
      token: env.TRELLO_TOKEN,
      idList: env.TRELLO_LIST_ID,
      name: input.name,
      desc: input.desc,
      due: input.due ?? undefined,
      pos: "top"
    };

    const response = await axios.post(`${trelloBaseUrl}/cards`, null, { params });
    const card = response.data as { id: string; url: string };

    if (input.labels.length > 0) {
      await Promise.all(
        input.labels.map((label) =>
          axios.post(`${trelloBaseUrl}/cards/${card.id}/labels`, null, {
            params: {
              key: env.TRELLO_API_KEY,
              token: env.TRELLO_TOKEN,
              color: toTrelloLabelColor(label)
            }
          })
        )
      );
    }

    return {
      id: card.id,
      url: card.url
    };
  }
}

function toTrelloLabelColor(priority: string): string {
  switch (priority) {
    case "critical":
      return "red";
    case "high":
      return "orange";
    case "medium":
      return "yellow";
    default:
      return "green";
  }
}

export const trelloClient = new TrelloClient();
