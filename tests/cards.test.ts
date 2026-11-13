import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBadgePage, readCardQueue } from "../src/cards.js";

afterEach(() => vi.unstubAllGlobals());

describe("Steam badge parsing", () => {
  it("finds remaining card drops and pagination while excluding foil badges", () => {
    const html = `<div class="badge_row is_link"><a class="badge_row_overlay" href="/profiles/1/gamecards/440/"></a><div class="badge_title">Team Fortress &amp; Friends<div>Level 1</div></div><span class="progress_info_bold">3 card drops remaining</span></div>
    <div class="badge_row is_link"><a class="badge_row_overlay" href="/profiles/1/gamecards/730/?border=1"></a><span class="progress_info_bold">2 card drops remaining</span></div>
    <div class="badge_row is_link"><a class="badge_row_overlay" href="/profiles/1/gamecards/500/"></a><span class="progress_info_bold">No card drops remaining</span></div><a class="pagelink" href="?p=4">4</a>`;
    expect(parseBadgePage(html)).toEqual({ games: [{ appid: 440, name: "Team Fortress & Friends", remaining: 3 }], pages: 4 });
  });
  it("rejects a login page instead of claiming all cards are collected", () => {
    expect(() => parseBadgePage('<html><title>Sign In</title><form id="login_form"></form></html>')).toThrow();
  });
  it("accepts a real badge page with no drops", () => {
    expect(parseBadgePage('<div class="badges_sheet"><div class="badge_row"><span class="progress_info_bold">No card drops remaining</span></div></div>').games).toEqual([]);
  });
  it("follows Steam's canonical profile redirect and reads later pages", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://steamcommunity.com/id/example/badges/?p=1" } }))
      .mockResolvedValueOnce(new Response('<div class="badges_sheet"></div><a class="pagelink" href="?p=2">2</a>'))
      .mockResolvedValueOnce(new Response('<div class="badge_row"><a class="badge_row_overlay" href="/gamecards/730/"></a><div class="badge_title">CS2</div><span class="progress_info_bold">1 card drop remaining</span></div>'));
    vi.stubGlobal("fetch", fetchMock);
    expect(await readCardQueue("76561198000000000", ["sessionid=example"])).toEqual([{ appid: 730, name: "CS2", remaining: 1 }]);
  });
  it("never forwards session cookies to a different origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://example.com/" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readCardQueue("76561198000000000", ["sessionid=example"])).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
