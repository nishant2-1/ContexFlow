import { createApp } from "./app";
import { env } from "./config/env";
import { workflowEventBus } from "./infrastructure/eventBus";
import { createWorkflowQueue } from "./infrastructure/workflowQueue";
import { workflowService } from "./services/workflow.service";
import { logger } from "./utils/logger";

const app = createApp();
const queue = createWorkflowQueue((event) => workflowService.handleTriggerEvent(event));

workflowEventBus.onIngested((event) => {
  void queue.enqueue(event);
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "ContextFlow server started");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void queue.shutdown();
  });
}
