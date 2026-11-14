#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { AccountManager } from "./manager.js";
import { log } from "./logger.js";
import { startDashboard } from "./dashboard.js";
import { createShutdown } from "./shutdown.js";
import { stopSamHelpers } from "./sam.js";

async function main(): Promise<void> {
  log.info("Steam HourForge X 2.4.9 — Your games. Your control.");
  const config = loadConfig();
  const manager = new AccountManager(config);
  let shutdown!: ReturnType<typeof createShutdown>;
  const dashboard = await startDashboard(manager, 17321, () => { void shutdown('dashboard'); });
  shutdown = createShutdown({
    stopAccounts: () => manager.stopAll(),
    stopHelpers: stopSamHelpers,
    closeServer: () => { dashboard.close(); dashboard.closeAllConnections(); },
    exit: code => process.exit(code),
    report: message => log.info(message),
  });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('uncaughtException', error => { log.fatal({err:error},'Uncaught exception'); void shutdown('uncaughtException',1); });
  process.on('unhandledRejection', reason => { log.fatal({reason},'Unhandled rejection'); void shutdown('unhandledRejection',1); });
  log.info("Steam HourForge X dashboard: http://127.0.0.1:17321");
  await manager.startAll();
}

main().catch(err => { log.fatal({err},'Fatal startup error'); process.exit(1); });
