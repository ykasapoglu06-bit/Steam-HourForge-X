import { load } from "cheerio";
export function parseAchievements(html: string): { unlocked: number; total: number } {
  const $ = load(html);
  $('script,style').remove();
  const text = $.root().text().replace(/\s+/g, ' ');
  const match = text.match(/Achievements:\s*([\d,]+)\s*\/\s*([\d,]+)/i) ?? text.match(/([\d,]+)\s*\/\s*([\d,]+)\s+achievements unlocked/i);
  if (match) {
    const unlocked = Number(match[1]!.replaceAll(',', ''));
    const total = Number(match[2]!.replaceAll(',', ''));
    if (Number.isSafeInteger(total) && total >= 0 && unlocked >= 0 && unlocked <= total) return { unlocked, total };
  }
  throw new Error("ACHIEVEMENTS_UNAVAILABLE");
}

export async function readAchievements(steamId: string, appid: number, cookies: string[]) {
  let target = new URL(`https://steamcommunity.com/profiles/${steamId}/stats/${appid}/achievements/?l=english`);
  for (let count=0;count<5;count++) {
    const response = await fetch(target, { headers: { Cookie: cookies.join('; ') }, redirect:'manual',signal:AbortSignal.timeout(20_000) });
    if (response.status >= 300 && response.status < 400) {
      const location=response.headers.get('location');
      if (!location) break;
      const next=new URL(location,target);
      if(next.origin!=='https://steamcommunity.com' || !/^\/(id|profiles)\/[^/]+\/(stats\/\d+\/achievements\/?|achievements\/\d+\/?)$/.test(next.pathname))break;
      next.searchParams.set('l','english');target=next;continue;
    }
    if(!response.ok)break;
    return {...parseAchievements(await response.text()),checkedAt:Date.now()};
  }
  throw new Error('ACHIEVEMENTS_UNAVAILABLE');
}
