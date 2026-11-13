export interface ShutdownOptions {
  stopAccounts: () => Promise<void>;
  stopHelpers: () => Promise<void>;
  closeServer: () => void;
  exit: (code: number) => void;
  report: (message: string) => void;
  timeoutMs?: number;
}

/** Stop only this application's resources; preserve saved account settings. */
export function createShutdown(options: ShutdownOptions) {
  let task: Promise<void> | null = null;
  return (reason: string, exitCode = 0): Promise<void> => {
    if (task) return task;
    task = (async () => {
      options.report(`Shutting down: ${reason}`);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          options.stopAccounts(),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('SHUTDOWN_TIMEOUT')), options.timeoutMs ?? 12_000); }),
        ]);
      } catch {
        exitCode = 1;
        options.report('Account cleanup did not finish normally; closing the application.');
      } finally {
        clearTimeout(timer);
        try { await options.stopHelpers(); } catch { exitCode = 1; }
        try { options.closeServer(); } finally { options.exit(exitCode); }
      }
    })();
    return task;
  };
}
