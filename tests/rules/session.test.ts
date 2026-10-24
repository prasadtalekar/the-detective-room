import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { get, ref, set, update, type Database } from "firebase/database";
import type { CasePack, Room, Submission } from "../../src/game";
import { makeSession } from "../../src/game";
import packs from "../../private/case-packs.json";
let activeDb: Database;
vi.mock("../../src/firebase", () => ({
  createFirebaseClient: () => ({ database: activeDb }),
}));
import {
  admit,
  award,
  control,
  createRoom,
  importCases,
  loadCase,
  removePlayer,
  saveNotebook,
  submit,
} from "../../src/api";
const pack = packs[0] as CasePack;
let env: RulesTestEnvironment;
const db = (uid: string) =>
  env.authenticatedContext(uid).database() as unknown as Database;
const at = (uid: string, path: string) => ref(db(uid), path);
const CODE = "ABC234";
function fixture(): Room {
  const room = makeSession(pack, 2, "host");
  room.members = {};
  for (let i = 1; i <= 6; i++) {
    const teamId = i <= 3 ? "t1" : "t2";
    const uid = `p${i}`;
    room.members[uid] = { name: uid, teamId };
    room.public.teams[teamId].roster ??= {};
    room.public.teams[teamId].roster![uid] = uid;
  }
  room.public.teams.t1.captain = "p1";
  room.public.teams.t2.captain = "p4";
  room.public.status = "running";
  room.public.deadline = Date.now() + 300000;
  return room;
}
const response = (): Submission => ({
  answers: { p0q1: "v7" },
  explanation: "E01 documents version 7.",
  run: 1,
  submittedAt: Date.now(),
});
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-detective-room",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("database.rules.json", "utf8"),
    },
  });
});
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (c) => {
    await set(ref(c.database()), {
      hosts: { host: true },
      rooms: { [CODE]: fixture() },
      libraries: { host: { aurora: pack } },
    });
  });
  activeDb = db("host");
});
afterAll(async () => {
  await env?.cleanup();
});
describe("security boundaries", () => {
  it("denies unauthenticated public reads, room scans and host creation by players", async () => {
    await assertFails(
      get(ref(env.unauthenticatedContext().database(), `rooms/${CODE}/public`)),
    );
    await assertFails(get(at("p1", "rooms")));
    await assertFails(
      set(at("p1", "rooms/XYZ234"), makeSession(pack, 2, "p1")),
    );
  });
  it("allows authenticated audience to read public state but not room roots or keys", async () => {
    await assertSucceeds(get(at("board", `rooms/${CODE}/public`)));
    await assertFails(get(at("board", `rooms/${CODE}`)));
    await assertFails(get(at("board", "libraries/host/aurora")));
    await assertFails(get(at("p1", "libraries/host/aurora")));
    await assertSucceeds(get(at("host", "libraries/host/aurora")));
  });
  it("prevents role escalation and library tampering", async () => {
    await assertFails(set(at("p1", "hosts/p1"), true));
    await assertFails(set(at("p1", "libraries/p1/aurora"), pack));
    await assertFails(set(at("p1", `rooms/${CODE}/hostUid`), "p1"));
  });
  it("isolates team notebooks, submissions and personal notes", async () => {
    await assertSucceeds(
      set(at("p1", `rooms/${CODE}/teams/t1/notebook`), {
        text: "Our theory",
        revision: 1,
      }),
    );
    await assertSucceeds(get(at("p2", `rooms/${CODE}/teams/t1`)));
    await assertFails(get(at("p4", `rooms/${CODE}/teams/t1`)));
    await assertFails(
      set(at("p4", `rooms/${CODE}/teams/t1/notebook`), {
        text: "Attack",
        revision: 2,
      }),
    );
    await assertSucceeds(
      set(at("p1", `rooms/${CODE}/personal/p1`), "My theory"),
    );
    await assertFails(get(at("p2", `rooms/${CODE}/personal/p1`)));
  });
  it("rejects scores, membership and solution writes from captains and board", async () => {
    for (const uid of ["p1", "board"])
      for (const path of [
        "public/teams/t1/scores/0",
        "public/solution",
        "members/p1/teamId",
      ]) {
        await assertFails(set(at(uid, `rooms/${CODE}/${path}`), 100));
      }
  });
  it("allows only the assigned captain to submit for the active phase", async () => {
    await assertSucceeds(
      set(at("p1", `rooms/${CODE}/teams/t1/submissions/0`), response()),
    );
    await assertFails(
      set(at("p2", `rooms/${CODE}/teams/t1/submissions/0`), response()),
    );
    await assertFails(
      set(at("p4", `rooms/${CODE}/teams/t1/submissions/0`), response()),
    );
    await assertFails(
      set(at("p1", `rooms/${CODE}/teams/t1/submissions/1`), response()),
    );
  });
  it("rejects paused, expired and stale-run submissions including deletions", async () => {
    await set(at("host", `rooms/${CODE}/public/status`), "paused");
    await assertFails(
      set(at("p1", `rooms/${CODE}/teams/t1/submissions/0`), response()),
    );
    await update(at("host", `rooms/${CODE}/public`), {
      status: "running",
      deadline: Date.now() - 1000,
    });
    await assertFails(
      set(at("p1", `rooms/${CODE}/teams/t1/submissions/0`), response()),
    );
    await update(at("host", `rooms/${CODE}/public`), {
      deadline: Date.now() + 300000,
      run: 2,
    });
    await assertFails(
      set(at("p1", `rooms/${CODE}/teams/t1/submissions/0`), response()),
    );
    await assertFails(
      set(at("p1", `rooms/${CODE}/teams/t1/submissions/0`), null),
    );
  });
  it("rejects oversized notes, forged timestamps, extra fields and invalid answer values", async () => {
    await assertFails(
      set(at("p1", `rooms/${CODE}/teams/t1/notebook`), {
        text: "x".repeat(8001),
        revision: 1,
      }),
    );
    await assertFails(
      set(at("p1", `rooms/${CODE}/teams/t1/submissions/0`), {
        ...response(),
        submittedAt: 0,
      }),
    );
    await assertFails(
      set(at("p1", `rooms/${CODE}/teams/t1/submissions/0`), {
        ...response(),
        score: 100,
      }),
    );
    await assertFails(
      set(at("p1", `rooms/${CODE}/teams/t1/submissions/0`), {
        ...response(),
        answers: { x: 200 },
      }),
    );
  });
  it("allows only self admission requests in lobby and prevents self assignment", async () => {
    await set(at("host", `rooms/${CODE}/public/status`), "lobby");
    await assertSucceeds(
      set(at("new", `rooms/${CODE}/joinRequests/new`), {
        name: "New investigator",
      }),
    );
    await assertFails(
      set(at("new", `rooms/${CODE}/joinRequests/p2`), {
        name: "Impersonation",
      }),
    );
    await assertFails(
      set(at("new", `rooms/${CODE}/members/new`), {
        name: "New",
        teamId: "t1",
      }),
    );
    await assertFails(
      set(at("new", `rooms/${CODE}/joinRequests/new`), {
        name: "New",
        admin: true,
      }),
    );
  });
  it("isolates and validates connection presence", async () => {
    await assertSucceeds(set(at("p1", `rooms/${CODE}/presence/t1/p1`), true));
    await assertFails(set(at("p2", `rooms/${CODE}/presence/t1/p1`), true));
    await assertFails(get(at("p4", `rooms/${CODE}/presence/t1`)));
    await assertSucceeds(set(at("p1", `rooms/${CODE}/presence/t1/p1`), null));
  });
});
describe("multiplayer service integration", () => {
  it("imports private packs and reserves collision-safe unique game rooms", async () => {
    await importCases(packs, "host");
    expect((await loadCase("host", "prototype")).title).toBe(
      "The Vanishing Prototype",
    );
    const [a, b] = await Promise.all([
      createRoom("host", pack, 2),
      createRoom("host", pack, 2),
    ]);
    expect(a).not.toBe(b);
    expect((await get(at("host", `rooms/${a}`))).val().hostUid).toBe("host");
  });
  it("atomically publishes a captain submission and its matching public progress marker", async () => {
    activeDb = db("p1");
    await submit(CODE, "t1", 0, response());
    expect(
      (
        await get(at("board", `rooms/${CODE}/public/teams/t1/progress/0`))
      ).val(),
    ).toBe(true);
  });
  it("rejects a progress marker without its matching submission", async () => {
    await assertFails(
      set(at("p1", `rooms/${CODE}/public/teams/t1/progress/0`), true),
    );
  });
  it("runs all five phases, reviews exact keys, reveals and restarts without stale scores", async () => {
    await set(at("host", `rooms/${CODE}/public/status`), "lobby");
    await control(CODE, "start", pack, Date.now());
    for (let phase = 0; phase < 5; phase++) {
      const answers = Object.fromEntries(
        pack.key[phase].map((k) => [k.id, k.answer]),
      );
      activeDb = db("p1");
      await submit(CODE, "t1", phase, {
        answers,
        explanation: "Causal chain with evidence and resolved red herrings.",
        run: 1,
        submittedAt: Date.now(),
      }).catch((error) => {
        throw new Error(`Phase ${phase} submit failed: ${error.message}`);
      });
      activeDb = db("host");
      await award(CODE, "t1", phase, pack, phase === 4 ? 60 : 0);
      await control(CODE, phase === 4 ? "finish" : "next", pack, Date.now());
    }
    let s = (await get(at("board", `rooms/${CODE}/public`))).val();
    expect(
      Object.values(s.teams.t1.scores).reduce(
        (a: number, b) => a + Number(b),
        0,
      ),
    ).toBe(1000);
    expect(s.solution).toBeUndefined();
    expect(s.status).toBe("finished");
    await set(at("host", `rooms/${CODE}/public/solution`), pack.solution);
    expect(
      (await get(at("board", `rooms/${CODE}/public/solution`))).val(),
    ).toBe(pack.solution);
    await control(CODE, "restart", pack, Date.now());
    s = (await get(at("board", `rooms/${CODE}/public`))).val();
    expect(s.run).toBe(2);
    expect(s.teams.t1.scores).toBeUndefined();
    expect(s.solution).toBeUndefined();
    expect(s.evidence).toBeUndefined();
    expect(
      (await get(at("p1", `rooms/${CODE}/teams/t1/submissions`))).exists(),
    ).toBe(false);
  });
  it("allows host controls with existing notebooks and older valid submissions", async () => {
    activeDb = db("p1");
    await saveNotebook(CODE, "t1", "Do not lose these notes", 0);
    await submit(CODE, "t1", 0, response());
    await env.withSecurityRulesDisabled(async (c) => {
      await set(
        ref(c.database(), `rooms/${CODE}/teams/t1/submissions/0/submittedAt`),
        Date.now() - 120000,
      );
    });
    activeDb = db("host");
    await control(CODE, "pause", pack, Date.now());
    await control(CODE, "resume", pack, Date.now());
    await award(CODE, "t1", 0, pack, 0);
    expect(
      (await get(at("p1", `rooms/${CODE}/teams/t1/notebook`))).val(),
    ).toEqual({ text: "Do not lose these notes", revision: 1 });
    expect(
      (await get(at("board", `rooms/${CODE}/public/teams/t1/scores/0`))).val(),
    ).toBe(25);
  });
  it("preserves remaining time across pause and resume", async () => {
    await control(CODE, "pause", pack, Date.now());
    const s = (await get(at("host", `rooms/${CODE}/public`))).val();
    expect(s.status).toBe("paused");
    expect(s.remaining).toBeGreaterThan(250000);
    await control(CODE, "resume", pack, Date.now() + 5000);
    const resumed = (await get(at("host", `rooms/${CODE}/public`))).val();
    expect(resumed.deadline).toBeGreaterThan(s.deadline + 4000);
  });
  it("merges concurrent admission transactions without losing a player and enforces captain reassignment", async () => {
    await set(at("host", `rooms/${CODE}/public/status`), "lobby");
    await Promise.all(
      ["newA", "newB"].map((uid) =>
        set(at(uid, `rooms/${CODE}/joinRequests/${uid}`), { name: uid }),
      ),
    );
    await Promise.all([admit(CODE, "newA", "t1"), admit(CODE, "newB", "t2")]);
    const members = (await get(at("host", `rooms/${CODE}/members`))).val();
    expect(Object.keys(members)).toHaveLength(8);
    await removePlayer(CODE, "p1");
    expect(
      (await get(at("host", `rooms/${CODE}/public/teams/t1/captain`))).val(),
    ).toMatch(/^(p2|p3|newA)$/);
  });
  it("detects concurrent notebook edits instead of silently overwriting them", async () => {
    activeDb = db("p1");
    await saveNotebook(CODE, "t1", "first writer", 0);
    activeDb = db("p2");
    await expect(saveNotebook(CODE, "t1", "stale writer", 0)).rejects.toThrow(
      "teammate updated",
    );
    await saveNotebook(CODE, "t1", "merged notes", 1);
    expect(
      (await get(at("p1", `rooms/${CODE}/teams/t1/notebook`))).val(),
    ).toEqual({ text: "merged notes", revision: 2 });
  });
  it("saves an existing notebook revision from a fresh client without a warm cache", async () => {
    await set(at("p1", `rooms/${CODE}/teams/t1/notebook`), {
      text: "Prior notes",
      revision: 1,
    });
    activeDb = db("p2");
    await saveNotebook(CODE, "t1", "Fresh client edit", 1);
    expect(
      (await get(at("p1", `rooms/${CODE}/teams/t1/notebook`))).val(),
    ).toEqual({ text: "Fresh client edit", revision: 2 });
  });
  it("does not overwrite a notebook from a stale fresh client", async () => {
    await set(at("p1", `rooms/${CODE}/teams/t1/notebook`), {
      text: "Latest notes",
      revision: 1,
    });
    activeDb = db("p2");
    await expect(saveNotebook(CODE, "t1", "Stale edit", 0)).rejects.toThrow(
      "teammate updated",
    );
    expect(
      (await get(at("p1", `rooms/${CODE}/teams/t1/notebook`))).val().text,
    ).toBe("Latest notes");
  });
  it("rejects a start with fewer than six players or empty teams", async () => {
    await set(at("host", `rooms/${CODE}`), makeSession(pack, 2, "host"));
    await expect(control(CODE, "start", pack, Date.now())).rejects.toThrow(
      "6–50",
    );
  });
});
