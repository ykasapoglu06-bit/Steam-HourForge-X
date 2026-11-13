import { load } from "cheerio";

export interface CardGame { appid: number; name: string; remaining: number }
export function parseBadgePage(html: string): { games: CardGame[]; pages: number } {
  const $ = load(html);
  if (!$('.badges_sheet, .badge_row, .badge_empty').length) {
    throw new Error("Steam rozet sayfası okunamadı; oturum veya sayfa yapısı değişmiş olabilir.");
  }
  const games: CardGame[] = [];
  $('.badge_row').each((_, element) => {
    const row = $(element);
    const href = row.find('a.badge_row_overlay').attr('href') ?? '';
    const appid = Number(href.match(/gamecards\/(\d+)/)?.[1]);
    if (!appid || /border=1/.test(href)) return;
    const text = row.find('.progress_info_bold').text();
    const remaining = Number(text.match(/(\d+)\s+card drops? remaining/i)?.[1] ?? 0);
    if (!remaining) return;
    const title = row.find('.badge_title').first().clone();
    title.children().remove();
    games.push({ appid, name: title.text().trim() || `Oyun ${appid}`, remaining });
  });
  let pages = 1;
  $('.pagelink').each((_, element) => {
    const page = Number(($(element).attr('href') ?? '').match(/[?&]p=(\d+)/)?.[1]);
    if (page > 0) pages = Math.max(pages, page);
  });
  if (pages > 100) throw new Error("Rozet sayfası sayısı beklenen sınırı aşıyor.");
  return { games, pages };
}

export async function readCardQueue(steamId: string, cookies: string[]): Promise<CardGame[]> {
  if (!/^\d{17}$/.test(steamId)) throw new Error("Steam kimliği geçersiz.");
  let canonical = `https://steamcommunity.com/profiles/${steamId}/badges/`;
  async function page(number: number) {
    let target = new URL(canonical);
    target.searchParams.set('p', String(number));
    target.searchParams.set('l', 'english');
    for (let redirect = 0; redirect < 4; redirect++) {
      const response = await fetch(target, {
        headers: { Cookie: cookies.join('; '), 'User-Agent': 'Steam HourForge X/2.0 (local dashboard)' },
        redirect: 'manual', signal: AbortSignal.timeout(25_000),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Steam yönlendirme adresi eksik.');
        const next = new URL(location, target);
        if (next.origin !== 'https://steamcommunity.com' || !/^\/(profiles|id)\/[^/]+\/badges\/?$/.test(next.pathname)) throw new Error('Steam rozet oturumu doğrulanamadı.');
        next.searchParams.set('l', 'english');
        target = next;
        canonical = next.origin + next.pathname;
        continue;
      }
      if (!response.ok) throw new Error(`Steam rozet sayfasına erişilemedi (HTTP ${response.status}).`);
      return parseBadgePage(await response.text());
    }
    throw new Error('Steam rozet yönlendirmesi tamamlanamadı.');
  }
  const first = await page(1);
  const games = [...first.games];
  for (let number = 2; number <= first.pages; number++) games.push(...(await page(number)).games);
  return [...new Map(games.map(game => [game.appid, game])).values()];
}
