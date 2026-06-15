import { Server } from "http";
import { prisma } from "../prismaClient";

export const gracefulShutdown = (server: Server) => {
  return () => {
    console.log("Received shutdown signal, closing server gracefully...");

    server.close(async () => {
      console.log("HTTP server closed.");

      // Disconnect from Prisma
      try {
        await prisma.$disconnect();
        console.log("Prisma client disconnected.");
      } catch (e) {
        console.error("Error disconnecting Prisma client", e);
      }

      // The process will now exit.
      process.exit(0);
    });

    // Force close after a timeout if connections are hanging
    setTimeout(() => {
      console.error("Could not close connections in time, forcefully shutting down");
      process.exit(1);
    }, 10000).unref(); // 10 seconds
  };
};
