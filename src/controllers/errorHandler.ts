import { NextFunction, Request, Response } from "express";
import { Server } from "http";
import { AppError } from "./AppError";
import { gracefulShutdown } from "./gracefulShutdown";

/**
 * A simple structured logger. In a real-world application,
 * this would be a more robust logger like Pino or Winston.
 */
const logger = {
  error: (message: string, meta: object) => {
    const logObject = {
      level: "error",
      timestamp: new Date().toISOString(),
      message,
      ...meta,
    };
    console.error(JSON.stringify(logObject, null, 2));
  },
};

export const createErrorHandler = (server: Server) => {
  return (err: Error, req: Request, res: Response, _next: NextFunction) => {
    let appError = err;
    let isOperationalError =
      err instanceof AppError && (err as AppError).isOperational;

    if (!(err instanceof AppError)) {
      // If the error is not one of our operational errors, wrap it
      // and mark it as non-operational.
      appError = new AppError("An internal server error occurred.", 500, false);
      isOperationalError = false;
    }

    const { statusCode, message } = appError as AppError;

    // For developers, log the full error stack. For production, you might omit this
    // or log to a secure, monitored location.
    const stack = process.env.NODE_ENV !== "production" ? err.stack : undefined;

    logger.error(message, {
      statusCode,
      isOperational: isOperationalError,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      stack,
    });

    if (!isOperationalError) {
      // A non-operational error occurred. This is a bug or system failure.
      // We should start a graceful shutdown.
      console.error(
        "FATAL ERROR: Non-operational error encountered. Starting graceful shutdown."
      );
      gracefulShutdown(server)();
    }

    res.status(statusCode).json({ error: message });
  };
};
