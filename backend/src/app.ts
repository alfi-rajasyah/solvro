import "express-async-errors";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { projectsRouter } from "./routes/projects.js";
import { tasksRouter } from "./routes/tasks.js";
import { overviewRouter } from "./routes/overview.js";
import { labelsRouter } from "./routes/labels.js";
import { customersRouter } from "./routes/customers.js";
import { sectionsRouter } from "./routes/sections.js";
import { holidaysRouter } from "./routes/holidays.js";
import { servicesRouter } from "./routes/services.js";
import { adminRouter } from "./routes/admin.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: false,
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/users", usersRouter);
  app.use("/overview", overviewRouter);
  app.use("/customers", customersRouter);
  app.use("/projects", projectsRouter);
  app.use("/tasks", tasksRouter);
  app.use("/labels", labelsRouter);
  app.use("/sections", sectionsRouter);
  app.use("/holidays", holidaysRouter);
  app.use("/services", servicesRouter);
  app.use("/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
