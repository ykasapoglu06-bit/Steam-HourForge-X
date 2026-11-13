import { LoginSession, EAuthTokenPlatformType, EAuthSessionGuardType } from "steam-session";
import SteamTotp from "steam-totp";
import qrcode from "qrcode-terminal";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { AccountConfig } from "./config.js";
import { log } from "./logger.js";

const LOGIN_TIMEOUT_MS = 120_000;

export interface AuthResult {
  refreshToken: string;
  accountName?: string;
}

export interface AuthOptions {
  onQR?: (url: string) => void | Promise<void>;
  signal?: AbortSignal;
  onGuard?: (challenge: AuthChallenge, submit: (code: string) => Promise<void>) => void;
}
export interface AuthChallenge { methods: ('email'|'authenticator'|'approval')[] }

export function loginError(err:unknown):string {
  const code=(err as {eresult?:number})?.eresult;
  if(code===5)return 'AUTH_INVALID_CREDENTIALS';
  if(code===84)return 'AUTH_RATE_LIMIT';
  if(code===65||code===88)return 'AUTH_GUARD_INVALID';
  const message=err instanceof Error?err.message:'';
  return ['LOGIN_CANCELLED','AUTH_TIMEOUT','AUTH_EXPIRED'].includes(message)?message:'AUTH_UNAVAILABLE';
}

export class QRLoginTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`QR login timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    this.name = "QRLoginTimeoutError";
  }
}

export async function authenticate(
  account: AccountConfig,
  dataDir: string,
  qrLoginTimeoutMs = LOGIN_TIMEOUT_MS,
  options: AuthOptions = {},
): Promise<AuthResult> {
  const tokenPath = join(dataDir, "tokens", `${account.name}.txt`);

  const saved = readSavedToken(tokenPath);
  if (saved) {
    log.debug({ account: account.name }, "Using saved refresh token");
    return saved;
  }

  if (account.loginMethod === "credentials" && account.accountName && account.password) {
    log.info({ account: account.name }, "Authenticating with credentials");
    const result = await loginWithCredentials(account, options);
    persistToken(tokenPath, result.refreshToken, result.accountName);
    return result;
  }

  log.info({ account: account.name }, "Authenticating with QR code");
  const result = await loginWithQR(account.name, qrLoginTimeoutMs, options);
  persistToken(tokenPath, result.refreshToken, result.accountName);
  return result;
}

export function clearSavedToken(accountName: string, dataDir: string): void {
  const tokenPath = join(dataDir, "tokens", `${accountName}.txt`);
  if (!existsSync(tokenPath)) return;
  writeFileSync(tokenPath, "", "utf-8");
  log.debug({ account: accountName }, "Cleared saved refresh token");
}

async function loginWithCredentials(account: AccountConfig, options: AuthOptions): Promise<AuthResult> {
  if (!account.accountName) throw new Error("accountName required for credential login");
  if (!account.password) throw new Error("password required for credential login");

  const session = new LoginSession(EAuthTokenPlatformType.SteamClient);
  session.loginTimeout = LOGIN_TIMEOUT_MS;
  options.signal?.throwIfAborted();

  return waitForSession(session,account.accountName,options,async()=>{
    const startResult = await session.startWithCredentials({
    accountName: account.accountName!,
    password: account.password!,
    steamGuardCode: account.sharedSecret
      ? SteamTotp.generateAuthCode(account.sharedSecret)
      : undefined,
    });
    if(options.signal?.aborted)return;
    if(startResult.actionRequired){
      const methods:AuthChallenge['methods']=[];
      for(const action of startResult.validActions??[]){
        if(action.type===EAuthSessionGuardType.EmailCode)methods.push('email');
        if(action.type===EAuthSessionGuardType.DeviceCode)methods.push('authenticator');
        if(action.type===EAuthSessionGuardType.DeviceConfirmation||action.type===EAuthSessionGuardType.EmailConfirmation)methods.push('approval');
      }
      options.onGuard?.({methods:[...new Set(methods)]},async(code)=>{
        if(options.signal?.aborted)throw new Error('AUTH_EXPIRED');
        await session.submitSteamGuardCode(code);
      });
    }
  });
}

// Register handlers before starting: accounts without Guard can authenticate immediately.
function waitForSession(session:LoginSession,fallback:string|undefined,options:AuthOptions,start:()=>Promise<void>,timeout:()=>Error=()=>new Error('AUTH_TIMEOUT')):Promise<AuthResult>{
  return new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{options.signal?.removeEventListener('abort',abort);session.removeListener('authenticated',authenticated);session.removeListener('timeout',timedOut);session.removeListener('error',failed);};
    const finish=(error?:unknown)=>{
      if(settled)return;settled=true;cleanup();
      if(error){session.cancelLoginAttempt();reject(error);}else resolve({refreshToken:session.refreshToken,accountName:session.accountName||fallback});
    };
    const authenticated=()=>finish(session.refreshToken?undefined:new Error('AUTH_UNAVAILABLE'));
    const timedOut=()=>finish(timeout());
    const failed=(error:Error)=>finish(error);
    const abort=()=>finish(new Error('LOGIN_CANCELLED'));
    session.on('authenticated',authenticated);session.on('timeout',timedOut);session.on('error',failed);
    options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted){abort();return;}
    void start().catch(failed);
  });
}

async function loginWithQR(accountName: string, timeoutMs: number, options: AuthOptions): Promise<AuthResult> {
  const session = new LoginSession(EAuthTokenPlatformType.SteamClient);
  session.loginTimeout = timeoutMs;
  options.signal?.throwIfAborted();

  return waitForSession(session,undefined,options,async()=>{
  const startResult = await session.startWithQR();
  if(options.signal?.aborted)return;
  if (!startResult.qrChallengeUrl) {
    throw new Error("Failed to retrieve QR code challenge URL from Steam");
  }

  console.log(`\n  Scan this QR code with your Steam mobile app (account: ${accountName}):\n`);
  qrcode.generate(startResult.qrChallengeUrl, { small: true });
  try { await options.onQR?.(startResult.qrChallengeUrl); }
  catch (err) { session.cancelLoginAttempt(); throw err; }
  },()=>new QRLoginTimeoutError(timeoutMs));
}

export function readSavedToken(tokenPath: string): AuthResult | null {
  if (!existsSync(tokenPath)) return null;
  const raw = readFileSync(tokenPath, "utf-8").trim();
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);
    if (data.refreshToken) {
      return {
        refreshToken: data.refreshToken,
        accountName: data.accountName,
      };
    }
  } catch {
    // Legacy plain text format fallback
  }

  return { refreshToken: raw };
}

export function persistToken(tokenPath: string, token: string, accountName?: string): void {
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, JSON.stringify({ refreshToken: token, accountName }), "utf-8");
  log.debug("Refresh token saved");
}
