export const PHASES = [
  { name: "Initial Investigation", seconds: 300, max: 100 },
  { name: "Evidence Correlation", seconds: 420, max: 150 },
  { name: "Witness Interrogation", seconds: 360, max: 150 },
  { name: "Timeline Reconstruction", seconds: 360, max: 200 },
  { name: "Final Accusation", seconds: 360, max: 400 },
] as const;
export interface Evidence {
  id: string;
  title: string;
  type: string;
  body: string;
  phase: number;
}
export interface Suspect {
  id: string;
  name: string;
  role: string;
  profile: string;
}
export interface Question {
  id: string;
  prompt: string;
  options: string[];
}
export interface Witness {
  name: string;
  exchanges: { question: string; response: string }[];
}
export interface TimelineEvent {
  id: string;
  label: string;
}
export interface CaseContent {
  id: string;
  title: string;
  briefing: string;
  suspects: Suspect[];
  evidence: Evidence[];
  questions: Record<string, Question[]>;
  witnesses: Witness[];
  events: TimelineEvent[];
}
export interface CasePack extends CaseContent {
  key: Record<string, { id: string; answer: string; points: number }[]>;
  solution: string;
}
export interface Member {
  name: string;
  teamId: string;
}
export interface Team {
  name: string;
  captain: string;
  scores?: Record<string, number>;
  roster?: Record<string, string>;
  progress?: Record<string, boolean>;
}
export interface Session {
  title: string;
  caseId: string;
  briefing: string;
  suspects: Suspect[];
  phase: number;
  status: "lobby" | "running" | "paused" | "finished";
  deadline: number;
  remaining: number;
  run: number;
  teams: Record<string, Team>;
  evidence?: Record<string, Evidence>;
  questions?: Record<string, Question[]>;
  witnesses?: Witness[];
  events?: TimelineEvent[];
  solution?: string;
}
export interface Submission {
  answers: Record<string, string>;
  explanation: string;
  run: number;
  submittedAt: number;
}
export interface TeamPrivate {
  notebook?: { text: string; revision: number };
  submissions?: Record<string, Submission>;
}
export interface Room {
  hostUid: string;
  public: Session;
  members?: Record<string, Member>;
  joinRequests?: Record<string, { name: string }>;
  teams?: Record<string, TeamPrivate>;
}
export const CASES = [
  { id: "aurora", title: "The Missing Project Aurora Document" },
  { id: "prototype", title: "The Vanishing Prototype" },
  { id: "meeting", title: "The Impossible Meeting" },
];
export function total(team: Team): number {
  return Object.values(team.scores ?? {}).reduce((a, b) => a + b, 0);
}
export function remaining(session: Session, now: number): number {
  return session.status === "running"
    ? Math.max(0, Math.ceil((session.deadline - now) / 1000))
    : Math.ceil(session.remaining / 1000);
}
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function score(
  key: CasePack["key"][string],
  answers: Record<string, string>,
  subjective = 0,
): number {
  return (
    key.reduce(
      (sum, item) => sum + (answers[item.id] === item.answer ? item.points : 0),
      0,
    ) +
    (Number.isFinite(subjective)
      ? Math.min(60, Math.max(0, Math.floor(subjective)))
      : 0)
  );
}
export function joinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (x) => alphabet[x % alphabet.length],
  ).join("");
}
export function makeSession(
  pack: CasePack,
  teamCount: number,
  uid: string,
): Room {
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 10)
    throw new Error("Choose 2–10 teams.");
  const teams = Object.fromEntries(
    Array.from({ length: teamCount }, (_, i) => [
      `t${i + 1}`,
      { name: `Team ${i + 1}`, captain: "" },
    ]),
  );
  return {
    hostUid: uid,
    public: {
      title: pack.title,
      caseId: pack.id,
      briefing: pack.briefing,
      suspects: pack.suspects,
      phase: 0,
      status: "lobby",
      deadline: 0,
      remaining: 300000,
      run: 1,
      teams,
    },
  };
}
export function releasePhase(
  session: Session,
  pack: CasePack,
  phase: number,
): Session {
  const evidence = { ...session.evidence };
  for (const card of pack.evidence)
    if (card.phase <= phase) evidence[card.id] = card;
  return {
    ...session,
    phase,
    evidence,
    questions: { ...session.questions, [phase]: pack.questions[phase] },
    ...(phase >= 2 ? { witnesses: pack.witnesses } : {}),
    ...(phase >= 3 ? { events: pack.events } : {}),
  };
}
export function validatePack(value: unknown): asserts value is CasePack {
  const p = value as CasePack;
  if (
    !p ||
    !CASES.some((c) => c.id === p.id) ||
    typeof p.title !== "string" ||
    typeof p.briefing !== "string" ||
    !Array.isArray(p.suspects) ||
    p.suspects.length !== 5 ||
    !Array.isArray(p.evidence) ||
    p.evidence.length !== 12 ||
    !Array.isArray(p.witnesses) ||
    !Array.isArray(p.events) ||
    p.events.length !== 4 ||
    typeof p.solution !== "string"
  )
    throw new Error("Invalid case pack.");
  PHASES.forEach((phase, i) => {
    if (
      !Array.isArray(p.questions?.[i]) ||
      !Array.isArray(p.key?.[i]) ||
      p.key[i].reduce((sum, k) => sum + k.points, 0) !==
        phase.max - (i === 4 ? 60 : 0)
    )
      throw new Error("Invalid phase scoring key.");
    for (const k of p.key[i]) {
      const q = p.questions[i].find((q) => q.id === k.id);
      if (!q || !q.options.includes(k.answer) || k.points < 0)
        throw new Error("Key must match question options.");
    }
  });
}
