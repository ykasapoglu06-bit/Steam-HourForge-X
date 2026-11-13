import { expect, it } from "vitest";
import { parseProfile } from "../src/profiles.js";
it("accepts Steam IDs, vanity names and Steam profile links", () => {
  expect(parseProfile("76561198000000000")).toEqual({ steamId: "76561198000000000" });
  expect(parseProfile("https://steamcommunity.com/profiles/76561198000000000/")).toEqual({ steamId: "76561198000000000" });
  expect(parseProfile("https://steamcommunity.com/id/example/")).toEqual({ vanity: "example" });
  expect(parseProfile("example")).toEqual({ vanity: "example" });
});
it("rejects non-Steam hosts, credentials in URLs and arbitrary paths", () => {
  for (const input of ["https://example.com/id/test/", "https://steamcommunity.com.evil.com/id/x", "https://user:secret@steamcommunity.com/id/x", "https://steamcommunity.com/login", "../../data"]) expect(() => parseProfile(input)).toThrow();
});
