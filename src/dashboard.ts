import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import type { AccountManager } from "./manager.js";

export async function startDashboard(manager: Pick<AccountManager, "getStates" | "control" | "addAccount" | "updatePreferences" | "lookupProfile" | "addGame" | "achievements" | "previewAchievements" | "completeAchievements" | "login" | "guard">, port = 17321) {
  const html = readFileSync(new URL("../ui/index.html", import.meta.url));
  const server = createServer(async (req, res) => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    const origin = `http://127.0.0.1:${actualPort}`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://cdn.akamai.steamstatic.com https://steamcdn-a.akamaihd.net https://avatars.steamstatic.com https://avatars.fastly.steamstatic.com https://avatars.akamai.steamstatic.com; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
    const json = (code: number, data: unknown) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(data)); };
    if (req.headers.host !== `127.0.0.1:${actualPort}`) return json(403, { error: "LOCAL_ONLY" });
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); return;
    }
    if (req.method === "GET" && ["/app.js", "/style.css", "/refinement.css", "/i18n.js", "/icon.svg", "/logo.png", "/flags/tr.svg", "/flags/en.svg", "/logos/steamidcheck.svg", "/avatar.svg", "/logos/vaclist.ico", "/logos/csrep.ico", "/logos/csstats.ico", "/logos/cswatch.png"].includes(req.url ?? "")) {
      const file = req.url!.slice(1);
      const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.ico') ? 'image/x-icon' : file.endsWith('.png') ? 'image/png' : 'text/css';
      res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
      res.end(readFileSync(new URL(`../ui/${file}`, import.meta.url))); return;
    }
    if (req.method === "GET" && req.url === "/api/status") return json(200, { app: "Steam HourForge X", version: "2.4.0", serverTime: Date.now(), accounts: manager.getStates() });
    if (req.method === "POST" && ["/api/control", "/api/accounts", "/api/preferences", "/api/profile", "/api/games", "/api/achievements", "/api/achievement-preview", "/api/achievement-complete", "/api/login", "/api/guard"].includes(req.url ?? "")) {
      if (req.headers.origin !== origin || !req.headers["content-type"]?.startsWith("application/json")) return json(403, { error: "LOCAL_ONLY" });
      try {
        let body = "";
        for await (const part of req) { body += part; if (body.length > 8192) return json(413, { error: "REQUEST_TOO_LARGE" }); }
        const data = JSON.parse(body);
        if (req.url === "/api/accounts") {
          if (typeof data.label !== "string") return json(400, { error: "INVALID_SETTINGS" });
          return json(201, { ok: true, name: manager.addAccount(data.label) });
        }
        if (typeof data.name !== "string") return json(400, { error: "INVALID_SETTINGS" });
        if(req.url==='/api/login'){await manager.login(data.name,data);return json(202,{ok:true});}
        if(req.url==='/api/guard'){await manager.guard(data.name,data.code);return json(200,{ok:true});}
        if(['/api/games','/api/achievements','/api/achievement-preview','/api/achievement-complete'].includes(req.url!)){
          if(!Number.isSafeInteger(data.appid)||data.appid<1||data.appid>2147483647)return json(400,{error:'INVALID_APPID'});
          if(req.url==='/api/games'){await manager.addGame(data.name,data.appid);return json(200,{ok:true});}
          if(req.url==='/api/achievement-preview')return json(200,await manager.previewAchievements(data.name,data.appid));
          if(req.url==='/api/achievement-complete'){
            if(typeof data.nonce!=='string'||!/^[a-f0-9]{48}$/.test(data.nonce)||data.confirmed!==true)return json(400,{error:'SAM_PREVIEW_EXPIRED'});
            if(data.ids!==undefined&&(!Array.isArray(data.ids)||data.ids.length>10000||data.ids.some((id:unknown)=>typeof id!=='string'||id.length>1024)))return json(400,{error:'SAM_PREVIEW_CHANGED'});
            return json(200,await manager.completeAchievements(data.name,data.appid,data.nonce,true,data.ids));
          }
          return json(200,await manager.achievements(data.name,data.appid));
        }
        if (req.url === "/api/preferences") { manager.updatePreferences(data.name, data.preferences); return json(200, { ok: true }); }
        if (req.url === "/api/profile") {
          if (typeof data.profile !== "string" || data.profile.length > 300) return json(400, { error: "PROFILE_INVALID" });
          return json(200, await manager.lookupProfile(data.name, data.profile));
        }
        if (!["pause", "resume", "next", "refreshCards", "refreshLibrary", "hours", "cards", "start", "stop", "logout"].includes(data.action)) return json(400, { error: "INVALID_ACTION" });
        await manager.control(data.name, data.action); return json(200, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        return json(400, { error: err instanceof Error && err.name === 'ZodError' ? "INVALID_SETTINGS" : /^[A-Z_]{3,40}$/.test(message) ? message : "OPERATION_FAILED" });
      }
    }
    json(404, { error: "Sayfa bulunamadı." });
  });
  const bindHost=process.env.DASHBOARD_HOST==='0.0.0.0'?'0.0.0.0':'127.0.0.1';
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, bindHost, resolve); });
  return server;
}


