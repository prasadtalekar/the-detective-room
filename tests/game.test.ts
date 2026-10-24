import { describe, expect, it } from "vitest";
import {
  PHASES,
  clock,
  joinCode,
  makeSession,
  releasePhase,
  remaining,
  score,
  total,
  validatePack,
  type CasePack,
} from "../src/game";
import packs from "../private/case-packs.json";
const cases = packs as CasePack[];
describe.each(cases)("$title", (pack) => {
  it("has a complete five-phase key worth 1000 with host-reviewed explanation", () => {
    expect(() => validatePack(pack)).not.toThrow();
    expect(
      Object.values(pack.key)
        .flat()
        .reduce((s, k) => s + k.points, 0),
    ).toBe(940);
    for (let i = 0; i < 5; i++) {
      const answers = Object.fromEntries(
        pack.key[i].map((k) => [k.id, k.answer]),
      );
      expect(score(pack.key[i], answers, i === 4 ? 60 : 0)).toBe(PHASES[i].max);
    }
  });
  it("keeps keys, solutions, future evidence and witness statements out of the lobby", () => {
    const room = makeSession(pack, 2, "host");
    const serialized = JSON.stringify(room.public);
    expect(serialized).not.toContain(pack.solution);
    expect(serialized).not.toContain(pack.evidence[0].body);
    expect(serialized).not.toContain('"key"');
    const first = releasePhase(room.public, pack, 0);
    expect(Object.keys(first.evidence ?? {})).toHaveLength(4);
    expect(first.witnesses).toBeUndefined();
    expect(first.events).toBeUndefined();
    expect(
      Object.keys(releasePhase(first, pack, 4).evidence ?? {}),
    ).toHaveLength(12);
  });
  it("uses each event once and links every decisive answer to released evidence", () => {
    expect(new Set(pack.events.map((e) => e.id)).size).toBe(4);
    expect(new Set(pack.key[3].map((k) => k.answer)).size).toBe(4);
    expect(pack.evidence.every((e) => e.phase <= 3)).toBe(true);
    expect(pack.key[4].map((k) => k.points)).toEqual([100, 60, 80, 100]);
  });
});
it("rejects malformed packs and invalid team limits", () => {
  expect(() => validatePack({})).toThrow();
  expect(() => makeSession(cases[0], 11, "host")).toThrow();
  expect(() => makeSession(cases[0], 1, "host")).toThrow();
});
it("counts down with a fixed deadline and freezes a paused timer", () => {
  const s = makeSession(cases[0], 2, "host").public;
  s.status = "running";
  s.deadline = 10000;
  expect(remaining(s, 8501)).toBe(2);
  expect(remaining(s, 11000)).toBe(0);
  s.status = "paused";
  s.remaining = 5500;
  expect(remaining(s, 999999)).toBe(6);
  expect(clock(420)).toBe("07:00");
});
it("scores only exact predefined answers and clamps manual points", () => {
  expect(score(cases[0].key[4], {}, 999)).toBe(60);
  expect(score(cases[0].key[4], {}, -10)).toBe(0);
  expect(
    total({ name: "Test", captain: "a", scores: { 0: 100, 4: 400 } }),
  ).toBe(500);
});
it("generates readable cryptographically random six-character codes", () => {
  const codes = Array.from({ length: 100 }, joinCode);
  expect(codes.every((c) => /^[A-HJ-NP-Z2-9]{6}$/.test(c))).toBe(true);
  expect(new Set(codes).size).toBe(100);
});

it("advances the stored phase together with released evidence and questions", () => {
  let session = makeSession(cases[0], 2, "host").public;
  for (let phase = 0; phase < 5; phase++) {
    session = releasePhase(session, cases[0], phase);
    expect(session.phase).toBe(phase);
    expect(session.questions?.[phase]).toEqual(cases[0].questions[phase]);
  }
});
