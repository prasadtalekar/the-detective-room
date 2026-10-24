import {
  get,
  ref,
  runTransaction,
  set,
  update,
  onDisconnect,
} from "firebase/database";
import { createFirebaseClient } from "./firebase";
import {
  joinCode,
  makeSession,
  PHASES,
  releasePhase,
  score,
  validatePack,
  type CasePack,
  type Room,
  type Submission,
} from "./game";
export const db = () => createFirebaseClient().database;
export const path = (p: string) => ref(db(), p);
export function roomCode(raw: string) {
  const code = raw.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code))
    throw new Error("Enter the six-character game code.");
  return code;
}
export async function importCases(raw: unknown, uid: string) {
  if (!Array.isArray(raw) || raw.length !== 3)
    throw new Error("Import all three official case packs.");
  raw.forEach(validatePack);
  await set(
    path(`libraries/${uid}`),
    Object.fromEntries(raw.map((p) => [p.id, p])),
  );
}
export async function loadCase(uid: string, id: string): Promise<CasePack> {
  const result = await get(path(`libraries/${uid}/${id}`));
  if (!result.exists())
    throw new Error("Import private/case-packs.json before creating a game.");
  const pack = result.val();
  validatePack(pack);
  return pack;
}
export async function createRoom(uid: string, pack: CasePack, teams: number) {
  const room = makeSession(pack, teams, uid);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = joinCode();
    try {
      const result = await runTransaction(
        path(`rooms/${code}`),
        (current) => (current === null ? room : undefined),
        { applyLocally: false },
      );
      if (result.committed) return code;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new Error("Could not reserve a game code. Try again.");
}
async function changeRoom(code: string, change: (room: Room) => Room) {
  const result = await runTransaction(
    path(`rooms/${roomCode(code)}`),
    (room: Room | null) => (room ? change(room) : undefined),
    { applyLocally: false },
  );
  if (!result.committed)
    throw new Error("Game unavailable or concurrent update rejected.");
}
export async function admit(code: string, uid: string, teamId: string) {
  await changeRoom(code, (room) => {
    const request = room.joinRequests?.[uid];
    if (!request) throw new Error("Join request no longer exists.");
    const count = Object.keys(room.members ?? {}).length;
    if (!room.members?.[uid] && count >= 50)
      throw new Error("The game already has 50 players.");
    if (room.public.status !== "lobby")
      throw new Error("Admit players in the lobby.");
    const team = room.public.teams[teamId];
    if (!team) throw new Error("Team not found.");
    room.members ??= {};
    room.members[uid] = { name: request.name, teamId };
    team.roster ??= {};
    team.roster[uid] = request.name;
    if (!team.captain) team.captain = uid;
    delete room.joinRequests![uid];
    return room;
  });
}
export async function removePlayer(code: string, uid: string) {
  await changeRoom(code, (room) => {
    const member = room.members?.[uid];
    if (!member) return room;
    const team = room.public.teams[member.teamId];
    delete team.roster?.[uid];
    if (team.captain === uid)
      team.captain = Object.keys(team.roster ?? {})[0] ?? "";
    delete room.members![uid];
    delete (room as Room & { personal?: Record<string, unknown> }).personal?.[
      uid
    ];
    return room;
  });
}
export async function control(
  code: string,
  action: "start" | "next" | "pause" | "resume" | "restart" | "finish",
  pack: CasePack,
  now: number,
) {
  await changeRoom(code, (room) => {
    let s = room.public;
    if (action === "restart") {
      const fresh = makeSession(
        pack,
        Object.keys(s.teams).length,
        room.hostUid,
      ).public;
      fresh.teams = Object.fromEntries(
        Object.entries(s.teams).map(([id, team]) => [
          id,
          {
            name: team.name,
            captain: team.captain,
            ...(team.roster ? { roster: team.roster } : {}),
          },
        ]),
      );
      fresh.run = s.run + 1;
      room.public = fresh;
      delete room.teams;
      return room;
    }
    if (action === "start") {
      const n = Object.keys(room.members ?? {}).length;
      if (
        s.status !== "lobby" ||
        n < 6 ||
        n > 50 ||
        Object.values(s.teams).some((t) => !t.captain)
      )
        throw new Error(
          "Start requires 6–50 admitted players and a captain in every team.",
        );
      s = releasePhase(s, pack, 0);
      s.status = "running";
      s.deadline = now + PHASES[0].seconds * 1000;
    } else if (action === "pause" && s.status === "running") {
      s.remaining = Math.max(0, s.deadline - now);
      s.status = "paused";
    } else if (action === "resume" && s.status === "paused") {
      s.deadline = now + s.remaining;
      s.status = "running";
    } else if (
      action === "next" &&
      (s.status === "running" || s.status === "paused") &&
      s.phase < 4
    ) {
      s = releasePhase(s, pack, s.phase + 1);
      s.status = "running";
      s.remaining = PHASES[s.phase].seconds * 1000;
      s.deadline = now + s.remaining;
    } else if (
      action === "finish" &&
      s.phase === 4 &&
      (s.status === "running" || s.status === "paused")
    ) {
      s.status = "finished";
      s.remaining = 0;
    } else throw new Error("That phase transition is not available.");
    room.public = s;
    return room;
  });
}
export async function releaseEvidence(
  code: string,
  pack: CasePack,
  id: string,
) {
  const card = pack.evidence.find((e) => e.id === id);
  if (!card) throw new Error("Evidence not found.");
  await set(path(`rooms/${code}/public/evidence/${id}`), card);
}
export async function award(
  code: string,
  teamId: string,
  phase: number,
  pack: CasePack,
  subjective: number,
) {
  await changeRoom(code, (room) => {
    const submission = room.teams?.[teamId]?.submissions?.[phase];
    if (!submission || submission.run !== room.public.run)
      throw new Error("No current submission for that phase.");
    const points = score(
      pack.key[phase],
      submission.answers,
      phase === 4 ? subjective : 0,
    );
    room.public.teams[teamId].scores ??= {};
    room.public.teams[teamId].scores![phase] = points;
    return room;
  });
}
export async function submit(
  code: string,
  teamId: string,
  phase: number,
  submission: Submission,
) {
  if (phase === 3 && new Set(Object.values(submission.answers)).size !== 4)
    throw new Error("Use each timeline event once.");
  await update(path(`rooms/${code}`), {
    [`teams/${teamId}/submissions/${phase}`]: submission,
    [`public/teams/${teamId}/progress/${phase}`]: true,
  });
}
export async function saveNotebook(
  code: string,
  teamId: string,
  text: string,
  revision: number,
) {
  if (text.length > 8000)
    throw new Error("Notes must be at most 8,000 characters.");
  const result = await runTransaction(
    path(`rooms/${code}/teams/${teamId}/notebook`),
    (current) => {
      if ((current?.revision ?? 0) !== revision) return;
      return { text, revision: revision + 1 };
    },
    { applyLocally: false },
  );
  if (!result.committed)
    throw new Error(
      "A teammate updated the notebook. Copy your draft, reload their version, then merge your changes.",
    );
}
export async function connectPresence(
  code: string,
  teamId: string,
  uid: string,
) {
  const location = path(`rooms/${code}/presence/${teamId}/${uid}`);
  await onDisconnect(location).remove();
  await set(location, true);
  return () => {
    void set(location, null).catch(() => {});
  };
}
