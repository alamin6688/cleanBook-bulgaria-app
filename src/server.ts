import { Server } from "http";
import app from "./app";
import config from "./config";
import prisma from "./lib/prisma";
import { BookingService } from "./app/modules/Booking/booking.service";
import logger from "./utils/logger/logger";

let server: Server;
let cleanupInterval: NodeJS.Timeout;

async function main() {
  try {
    // 1. Connect to database
    await prisma.$connect();
    logger.info("🛢️ Database connected successfully");

    // 2. Start HTTP server
    server = app.listen(config.port, config.host, () => {
      logger.info(`🚀 Server running on ${config.host}:${config.port} [${config.env}]`);
      
      // Automatic cleanup: Mark PENDING bookings > 3 hours old as CANCELLED every 15 minutes
      cleanupInterval = setInterval(async () => {
        try {
          await BookingService.cleanupPendingBookings();
        } catch (error) {
          logger.error("[Cleanup Error]", error);
        }
      }, 15 * 60 * 1000); // 15 minutes
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        logger.error(`❌ Port ${config.port} is already in use`);
      } else {
        logger.error(`❌ Server error: ${error.message}`);
      }
      process.exit(1);
    });
  } catch (error) {
    logger.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

main();

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    logger.info("Background cleanup interval cleared.");
  }

  if (server) {
    server.close(async () => {
      logger.info("HTTP server closed.");

      try {
        await prisma.$disconnect();
        logger.info("Database disconnected.");
      } catch (err) {
        logger.error("Error disconnecting database:", err);
      }

      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      logger.error("Graceful shutdown timeout. Force exiting.");
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

const unexpectedErrorHandler = (error: unknown) => {
  logger.error("Unexpected error:", error);
  gracefulShutdown("UNEXPECTED_ERROR");
};

process.on("uncaughtException", unexpectedErrorHandler);
process.on("unhandledRejection", unexpectedErrorHandler);
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
