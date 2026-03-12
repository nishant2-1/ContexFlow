import { createApp } from "./app";
import { env } from "./config/env";
import { workflowEventBus } from "./infrastructure/eventBus";
import { workflowService } from "./services/workflow.service";
import { logger } from "./utils/logger";

const app = createApp();

workflowEventBus.onIngested((event) => {
  void workflowService.handleTriggerEvent(event);
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "ContextFlow server started");
});
