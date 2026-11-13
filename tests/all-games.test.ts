import { expect, it } from "vitest";
import { gameBatch, batchCount } from "../src/all-games.js";

it("rotates every owned game without exceeding 32 concurrent games", () => {
  const games = Array.from({ length: 35 }, (_, i) => i + 1);
  expect(gameBatch(games, 0)).toEqual(games.slice(0, 32));
  expect(gameBatch(games, 1)).toEqual([33, 34, 35]);
  expect(gameBatch(games, 2)).toEqual(games.slice(0, 32));
  expect(gameBatch([], 0)).toEqual([]);
});

it("keeps pinned games active in every batch and rotates all remaining games", () => {
  const games = Array.from({ length: 65 }, (_, i) => i + 1);
  expect(gameBatch(games, 0, [1, 64])).toEqual([1, 64, ...Array.from({ length: 30 }, (_, i) => i + 2)]);
  expect(gameBatch(games, 1, [1, 64])).toEqual([1, 64, ...Array.from({ length: 30 }, (_, i) => i + 32)]);
  expect(gameBatch(games, 2, [1, 64])).toEqual([1, 64, 62, 63, 65]);
  expect(batchCount(games, [1, 64])).toBe(3);
  expect(gameBatch(games, 3, [1, 64])).toEqual(gameBatch(games, 0, [1, 64]));
});

it("deduplicates pinned games, ignores unavailable IDs and never exceeds 32", () => {
  const games = Array.from({ length: 35 }, (_, i) => i + 1);
  expect(gameBatch(games, 0, [1, 1, 999])).toHaveLength(32);
  expect(gameBatch(games, 0, [1, 1, 999]).filter(id => id === 1)).toHaveLength(1);
  expect(gameBatch(games, 0, games.slice(0, 32))).toEqual(games.slice(0, 32));
  expect(batchCount(games, games.slice(0, 32))).toBe(1);
});
