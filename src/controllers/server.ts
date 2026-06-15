import express from "express";
import http from "http";
import { AppError } from "./AppError";
import { createErrorHandler } from "./errorHandler";
import { gracefulShutdown } from "./gracefulShutdown";

const app = express();

app.get("/", (_req, res) => {
  res.send("Hello, world!");
});

app.get("/error", (_req, res, next) => {
  // Operational error example
  return next(new AppError("This is a test error!", 400));
});

app.get("/fatal", (_req, _res, next) => {
  // Non-operational / fatal error example
  Promise.resolve()
    .then(() => {
      throw new Error("Something went wrong asynchronously");
    })
    .catch(next);
});

const httpServer = http.createServer(app);

// Error handler must be last
app.use(createErrorHandler(httpServer));

const PORT = process.env.PORT || 3000;

export const server = httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

process.on("unhandledRejection", (reason: unknown) => {
  const stack = reason instanceof Error ? reason.stack : undefined;
  console.error("Unhandled Rejection at:", stack ?? reason);
  gracefulShutdown(httpServer)();
});

process.on("SIGTERM", gracefulShutdown(httpServer));
process.on("SIGINT", gracefulShutdown(httpServer));
