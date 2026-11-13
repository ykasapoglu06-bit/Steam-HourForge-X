import { expect, it } from "vitest";
import { parseAchievements } from "../src/achievements.js";
it("reads Steam's current achievement summary including zero unlocked",()=>{
  expect(parseAchievements('<span>Achievements: 0 / 73</span>')).toEqual({unlocked:0,total:73});
  expect(parseAchievements('<span>21/73 achievements unlocked <span>(28%)</span></span>')).toEqual({unlocked:21,total:73});
});
it("does not turn private, unsupported or malformed pages into zero achievements",()=>{
  for(const html of ['<title>Sign In</title>','<p>Private</p>','<span>Achievements: 90 / 73</span>'])expect(()=>parseAchievements(html)).toThrow('ACHIEVEMENTS_UNAVAILABLE');
});
