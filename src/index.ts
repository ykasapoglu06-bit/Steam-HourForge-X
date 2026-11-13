#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { AccountManager } from "./manager.js";
import { log } from "./logger.js";
import { startDashboard } from "./dashboard.js";

async function main(): Promise<void> {
  log.info("Steam HourForge X 2.4.3 — Your library. Your pace.");

  const config = loadConfig();
  const manager = new AccountManager(config);
  const dashboard = await startDashboard(manager);
  log.info("Steam HourForge X dashboard: http://127.0.0.1:17321");
  process.once("SIGINT", () => dashboard.close());
  process.once("SIGTERM", () => dashboard.close());

  setupShutdown(manager);

  await manager.startAll();
}

function setupShutdown(manager: AccountManager): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log.info({ signal }, "Shutting down...");
    await manager.stopAll();
    log.info("Goodbye");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    log.fatal({ err }, "Uncaught exception");
    shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    log.fatal({ reason }, "Unhandled rejection");
    shutdown("unhandledRejection");
  });
}

main().catch((err) => {
  log.fatal({ err }, "Fatal startup error");
  process.exit(1);
});


