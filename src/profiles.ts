import { load } from "cheerio";

export function parseProfile(input: string): { steamId?: string; vanity?: string } {
  const value = input.trim();
  if (/^\d{17}$/.test(value)) return { steamId: value };
  if (/^[A-Za-z0-9_-]{1,64}$/.test(value)) return { vanity: value };
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("PROFILE_INVALID"); }
  if (!['http:', 'https:'].includes(url.protocol) || !['steamcommunity.com', 'www.steamcommunity.com'].includes(url.hostname) || url.port || url.username || url.password) throw new Error("PROFILE_INVALID");
  const match = url.pathname.match(/^\/(profiles|id)\/([A-Za-z0-9_-]{1,64})\/?$/);
  if (!match) throw new Error("PROFILE_INVALID");
  if (match[1] === 'profiles') {
    if (!/^\d{17}$/.test(match[2]!)) throw new Error("PROFILE_INVALID");
    return { steamId: match[2] };
  }
  return { vanity: match[2] };
}

export async function resolveProfile(input: string): Promise<string> {
  const parsed = parseProfile(input);
  if (parsed.steamId) return parsed.steamId;
  let url = new URL(`https://steamcommunity.com/id/${parsed.vanity}/?xml=1`);
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    if (response.status >= 300 && response.status < 400) {
      const next = new URL(response.headers.get('location') ?? '/', url);
      if (next.origin !== 'https://steamcommunity.com' || !/^\/(id|profiles)\/[^/]+\/?$/.test(next.pathname)) throw new Error("PROFILE_UNAVAILABLE");
      next.searchParams.set('xml', '1'); url = next; continue;
    }
    if (!response.ok) throw new Error("PROFILE_UNAVAILABLE");
    const $ = load(await response.text(), { xmlMode: true });
    const id = $('profile > steamID64').text().trim();
    if (!/^\d{17}$/.test(id)) throw new Error("PROFILE_UNAVAILABLE");
    return id;
  }
  throw new Error("PROFILE_UNAVAILABLE");
}
