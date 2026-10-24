import { Component, useEffect, useState, type ReactNode } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { set } from "firebase/database";
import { createFirebaseClient } from "./firebase";
import {
  admit,
  award,
  connectPresence,
  control,
  createRoom,
  importCases,
  loadCase,
  path,
  releaseEvidence,
  removePlayer,
  roomCode,
  saveNotebook,
  submit,
} from "./api";
import { useClock, useUser, useValue } from "./hooks";
import {
  CASES,
  PHASES,
  clock,
  remaining,
  total,
  type CasePack,
  type Member,
  type Room,
  type Session,
  type Submission,
  type TeamPrivate,
} from "./game";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "The operation failed.";
}
function useAction() {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(task: () => Promise<unknown>, success = "Saved.") {
    setBusy(true);
    setNotice("");
    try {
      await task();
      setNotice(success);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return { act, busy, notice };
}
function Message({ children }: { children: ReactNode }) {
  return children ? (
    <p role="status" className="notice">
      {children}
    </p>
  ) : null;
}
function Shell({ children, role }: { children: ReactNode; role: string }) {
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">
          ◈{" "}
          <span>
            The Detective Room<small>INVESTIGATION HEADQUARTERS</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/host" aria-current={role === "Host" ? "page" : undefined}>
            Host
          </a>
          <a href="/play" aria-current={role === "Player" ? "page" : undefined}>
            Play
          </a>
          <a href="/board" aria-current={role === "Board" ? "page" : undefined}>
            Board
          </a>
        </nav>
      </header>
      <main className={role === "Board" ? "workspace audience" : "workspace"}>
        {children}
      </main>
      <footer>
        Fictional cases. Real teamwork.{" "}
        <span>The Detective Room / Office investigations</span>
      </footer>
    </>
  );
}
function Intro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children}
    </div>
  );
}
function Leaderboard({ session }: { session: Session }) {
  const teams = Object.entries(session.teams).sort(
    (a, b) => total(b[1]) - total(a[1]),
  );
  return (
    <section className="panel">
      <h2>
        {session.status === "finished" ? "Final rankings" : "Live leaderboard"}
      </h2>
      <p className="muted">Host-reviewed points · maximum 1,000</p>
      <ol className="leaderboard">
        {teams.map(([id, team], i) => (
          <li key={id}>
            <span className="rank">
              {i > 0 && total(team) === total(teams[i - 1][1]) ? "=" : i + 1}
            </span>
            <div>
              <strong>{team.name}</strong>
              <small>
                {Object.keys(team.roster ?? {}).length} investigators ·{" "}
                {Object.keys(team.progress ?? {}).length}/5 submitted ·{" "}
                {Object.keys(team.scores ?? {}).length}/5 reviewed
              </small>
            </div>
            <b>
              {total(team)}
              <small> / 1000</small>
            </b>
          </li>
        ))}
      </ol>
    </section>
  );
}
function SessionHeader({
  code,
  session,
  now,
  connected,
}: {
  code: string;
  session: Session;
  now: number;
  connected: boolean;
}) {
  return (
    <>
      <div className="session-heading">
        <Intro
          eyebrow={`CASE FILE / ${session.caseId.toUpperCase()}`}
          title={session.title}
        >
          <p>{session.briefing}</p>
        </Intro>
        <div className="code-box">
          <small>GAME CODE</small>
          <strong>{code}</strong>
          <span className={connected ? "online" : "offline"}>
            {connected
              ? "● Live connection"
              : "● Reconnecting — actions may fail"}
          </span>
        </div>
      </div>
      <section className="phasebar">
        <div>
          <p className="eyebrow">
            {session.status.toUpperCase()} · RUN {session.run}
          </p>
          <h2>
            {session.status === "lobby"
              ? "Assemble your investigation teams"
              : session.status === "finished"
                ? "Investigation closed"
                : PHASES[session.phase].name}
          </h2>
          <p className="muted">
            {session.status === "running" && remaining(session, now) === 0
              ? "Time elapsed. Submissions locked; awaiting host."
              : `Phase ${session.phase + 1} of 5 · ${PHASES[session.phase].max} points available`}
          </p>
        </div>
        <div className="timer" role="timer" aria-label="Phase countdown">
          {clock(remaining(session, now))}
        </div>
      </section>
      <div className="phase-track">
        {PHASES.map((p, i) => (
          <span key={p.name} className={i === session.phase ? "active" : ""}>
            {i + 1}. {p.name}
          </span>
        ))}
      </div>
    </>
  );
}
function EvidenceBoard({ session }: { session: Session }) {
  const [filter, setFilter] = useState("");
  const cards = Object.values(session.evidence ?? {}).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  return (
    <section className="panel">
      <div className="section-title">
        <h2>
          Evidence board{" "}
          <span className="pill">{cards.length}/12 released</span>
        </h2>
        <label className="search">
          Search evidence
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="ID, witness, device…"
          />
        </label>
      </div>
      {cards.length === 0 && (
        <p className="empty">
          Evidence is sealed. The host releases the first batch when the
          investigation begins.
        </p>
      )}
      <div className="evidence-grid">
        {cards
          .filter((card) =>
            `${card.id} ${card.title} ${card.body}`
              .toLowerCase()
              .includes(filter.toLowerCase()),
          )
          .map((card) => (
            <article key={card.id} className="evidence-card">
              <p className="eyebrow">
                {card.id} / {card.type}
              </p>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
      </div>
    </section>
  );
}
function Suspects({ session }: { session: Session }) {
  return (
    <section className="panel">
      <h2>Persons of interest</h2>
      <div className="suspect-grid">
        {session.suspects.map((s) => (
          <article className="suspect" key={s.id}>
            <div className="avatar">
              {s.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
            <h3>{s.name}</h3>
            <small>{s.role}</small>
            <p>{s.profile}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
function Witnesses({ session }: { session: Session }) {
  return session.witnesses ? (
    <section className="panel">
      <h2>Witness interrogation</h2>
      <p className="muted">
        Choose a prepared question to inspect the recorded response.
      </p>
      {session.witnesses.map((w) => (
        <div key={w.name} className="witness">
          <h3>{w.name}</h3>
          {w.exchanges.map((x) => (
            <details key={x.question}>
              <summary>{x.question}</summary>
              <p>{x.response}</p>
            </details>
          ))}
        </div>
      ))}
    </section>
  ) : null;
}
function Solution({ session }: { session: Session }) {
  return session.solution ? (
    <section className="panel revelation">
      <p className="eyebrow">CASE REVELATION</p>
      <h2>The complete explanation</h2>
      <p>{session.solution}</p>
    </section>
  ) : null;
}
function CodeForm({
  onCode,
  label = "Open investigation",
}: {
  onCode: (code: string) => void;
  label?: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onCode(roomCode(code));
        } catch (err) {
          setError(errorText(err));
        }
      }}
    >
      <label>
        Game code
        <input
          required
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC234"
          autoCapitalize="characters"
        />
      </label>
      <button>{label}</button>
      <Message>{error}</Message>
    </form>
  );
}
function Home() {
  return (
    <Shell role="Home">
      <Intro
        eyebrow="A COMPETITIVE MULTIPLAYER INVESTIGATION"
        title="Every detail tells a story."
      >
        <p>
          Inspect the evidence. Challenge the alibis. Build a case your team can
          defend.
        </p>
      </Intro>
      <div className="metrics">
        <div>
          <strong>6–50</strong>
          <span>investigators</span>
        </div>
        <div>
          <strong>5</strong>
          <span>investigation phases</span>
        </div>
        <div>
          <strong>1,000</strong>
          <span>points per case</span>
        </div>
        <div>
          <strong>30 min</strong>
          <span>on the case</span>
        </div>
      </div>
      <div className="role-grid">
        {[
          [
            "/host",
            "01 / DIRECT",
            "Host an investigation",
            "Create a room, release evidence, direct the clock and review your teams’ conclusions.",
          ],
          [
            "/play",
            "02 / INVESTIGATE",
            "Join your team",
            "Inspect case files, compare witness accounts and piece together a defensible accusation.",
          ],
          [
            "/board",
            "03 / FOLLOW",
            "Open the audience board",
            "Present the unfolding investigation, released evidence and live rankings.",
          ],
        ].map(([url, tag, title, body]) => (
          <a className="panel role-card" href={url} key={url}>
            <p className="eyebrow">{tag}</p>
            <h2>{title}</h2>
            <p>{body}</p>
            <span>Enter workspace →</span>
          </a>
        ))}
      </div>
      <section className="panel">
        <h2>Three cases. One standard of proof.</h2>
        <div className="case-list">
          {CASES.map((c, i) => (
            <div key={c.id}>
              <span className="eyebrow">CASE 00{i + 1}</span>
              <h3>{c.title}</h3>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
function Host() {
  const { user, error } = useUser(false);
  const permission = useValue<boolean>(user ? `hosts/${user.uid}` : null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(
    () => localStorage.getItem("detective-host-code") ?? "",
  );
  const room = useValue<Room>(
    user && permission.value && code ? `rooms/${code}` : null,
  );
  const [caseId, setCaseId] = useState("aurora");
  const [teamCount, setTeamCount] = useState(2);
  const [pack, setPack] = useState<CasePack | null>(null);
  const action = useAction();
  const { now, connected } = useClock();
  useEffect(() => {
    if (room.value && user) {
      void loadCase(user.uid, room.value.public.caseId)
        .then(setPack)
        .catch(() => setPack(null));
    }
  }, [room.value?.public.caseId, user?.uid]);
  function selectCode(value: string) {
    setCode(value);
    localStorage.setItem("detective-host-code", value);
  }
  if (!user || user.isAnonymous)
    return (
      <Shell role="Host">
        <Intro eyebrow="HOST ACCESS" title="Direct the investigation.">
          <p>
            Sign in with your provisioned host account. Players do not need an
            email account.
          </p>
        </Intro>
        <form
          className="panel auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action.act(
              () =>
                signInWithEmailAndPassword(
                  createFirebaseClient().auth,
                  email,
                  password,
                ),
              "Signed in.",
            );
          }}
        >
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <button disabled={action.busy}>Sign in</button>
          <Message>{error || action.notice}</Message>
        </form>
      </Shell>
    );
  return (
    <Shell role="Host">
      <div className="toolbar">
        <span>Host: {user.email}</span>
        <button
          className="secondary"
          onClick={() => void signOut(createFirebaseClient().auth)}
        >
          Sign out
        </button>
      </div>
      <Message>
        {error || permission.error || room.error || action.notice}
      </Message>
      {!permission.value ? (
        <section className="panel">
          <h1>Host access required</h1>
          <p>
            This account must be added to the database host allowlist by the
            Firebase project administrator. See DEVELOPMENT.md.
          </p>
        </section>
      ) : !room.value ? (
        <>
          <Intro
            eyebrow="OPERATIONS DESK"
            title="Prepare the next investigation."
          />
          <div className="two-col">
            <section className="panel">
              <h2>Create a game</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.act(async () => {
                    const p = await loadCase(user.uid, caseId);
                    setPack(p);
                    selectCode(await createRoom(user.uid, p, teamCount));
                  }, "Game created. Share its code with players.");
                }}
              >
                <label>
                  Case
                  <select
                    value={caseId}
                    onChange={(e) => setCaseId(e.target.value)}
                  >
                    {CASES.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Number of teams
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={teamCount}
                    onChange={(e) => setTeamCount(Number(e.target.value))}
                  />
                </label>
                <button disabled={action.busy}>Create investigation</button>
              </form>
            </section>
            <section className="panel">
              <h2>Host library</h2>
              <p>
                Import <code>private/case-packs.json</code> from this
                repository. It uploads to your private host library, never the
                public app.
              </p>
              <label>
                Import official case packs
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void action.act(
                        async () =>
                          importCases(JSON.parse(await f.text()), user.uid),
                        "Three private case packs imported.",
                      );
                  }}
                />
              </label>
              <h3>Reconnect to a game</h3>
              <CodeForm onCode={selectCode} />
              <button className="secondary" onClick={() => selectCode("")}>
                Clear saved room
              </button>
            </section>
          </div>
        </>
      ) : (
        <>
          <SessionHeader
            code={code}
            session={room.value.public}
            now={now}
            connected={connected}
          />
          <div className="toolbar">
            <button className="secondary" onClick={() => selectCode("")}>
              Back to game setup
            </button>
            <a href={`/board?code=${code}`} target="_blank" rel="noreferrer">
              Open audience board ↗
            </a>
          </div>
          {!pack ? (
            <section className="panel">
              <h2>Private library unavailable</h2>
              <p>Reimport the official case packs to enable controls.</p>
              <input
                aria-label="Import case packs"
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void action.act(async () => {
                      await importCases(
                        JSON.parse(await file.text()),
                        user.uid,
                      );
                      setPack(
                        await loadCase(user.uid, room.value!.public.caseId),
                      );
                    });
                }}
              />
            </section>
          ) : (
            <>
              <HostControls
                room={room.value}
                code={code}
                pack={pack}
                now={now}
                act={action.act}
                busy={action.busy || !connected}
              />
              <div className="two-col">
                <HostTeams room={room.value} code={code} act={action.act} />
                <Leaderboard session={room.value.public} />
              </div>
              <HostReview
                room={room.value}
                code={code}
                pack={pack}
                act={action.act}
              />
              <section className="panel">
                <h2>Evidence release controls</h2>
                <p className="muted">
                  Each phase automatically releases its scheduled cards. You can
                  release any card early.
                </p>
                <div className="chip-list">
                  {pack.evidence.map((card) => (
                    <button
                      className="secondary"
                      disabled={!!room.value?.public.evidence?.[card.id]}
                      key={card.id}
                      onClick={() =>
                        void action.act(
                          () => releaseEvidence(code, pack, card.id),
                          `${card.id} released.`,
                        )
                      }
                    >
                      {card.id} · {card.title}{" "}
                      {room.value?.public.evidence?.[card.id] ? "✓" : "+"}
                    </button>
                  ))}
                </div>
              </section>
              <details className="panel">
                <summary>Confidential answer key — host only</summary>
                <p>{pack.solution}</p>
                {PHASES.map((p, i) => (
                  <div key={p.name}>
                    <h3>{p.name}</h3>
                    {pack.key[i].map((k) => (
                      <p key={k.id}>
                        {pack.questions[i].find((q) => q.id === k.id)?.prompt}:{" "}
                        <strong>{k.answer}</strong> ({k.points} points)
                      </p>
                    ))}
                  </div>
                ))}
              </details>
            </>
          )}
          <Solution session={room.value.public} />
        </>
      )}
    </Shell>
  );
}
type Act = ReturnType<typeof useAction>["act"];
function HostControls({
  room,
  code,
  pack,
  now,
  act,
  busy,
}: {
  room: Room;
  code: string;
  pack: CasePack;
  now: number;
  act: Act;
  busy: boolean;
}) {
  const s = room.public;
  return (
    <section className="panel">
      <h2>Phase and timer controls</h2>
      <div className="toolbar">
        {s.status === "lobby" && (
          <button
            disabled={busy}
            onClick={() =>
              void act(
                () => control(code, "start", pack, now),
                "Investigation started.",
              )
            }
          >
            Start investigation
          </button>
        )}
        {s.status === "running" && (
          <button
            disabled={busy}
            onClick={() =>
              void act(() => control(code, "pause", pack, now), "Timer paused.")
            }
          >
            Pause
          </button>
        )}
        {s.status === "paused" && (
          <button
            disabled={busy}
            onClick={() =>
              void act(
                () => control(code, "resume", pack, now),
                "Timer resumed.",
              )
            }
          >
            Resume
          </button>
        )}
        {["running", "paused"].includes(s.status) && (
          <button
            disabled={busy}
            onClick={() => {
              if (confirm("Close current submissions and advance?"))
                void act(
                  () =>
                    control(code, s.phase === 4 ? "finish" : "next", pack, now),
                  "Phase advanced.",
                );
            }}
          >
            {s.phase === 4 ? "Close investigation" : "Next phase"}
          </button>
        )}
        <button
          className="danger"
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                "Restart this case? All scores and official submissions will be cleared. Teams stay registered.",
              )
            )
              void act(
                () => control(code, "restart", pack, now),
                "Case reset to lobby.",
              );
          }}
        >
          Restart case
        </button>
        <button
          className="secondary"
          disabled={s.status !== "finished" || !!s.solution || busy}
          onClick={() => {
            if (confirm("Reveal the complete solution to everyone?"))
              void act(
                () => set(path(`rooms/${code}/public/solution`), pack.solution),
                "Solution revealed.",
              );
          }}
        >
          Reveal solution
        </button>
      </div>
      <p className="muted">
        Minimum 6 players; every team needs a captain. At zero, answers lock
        automatically. Advancing and final revelation require host action.
      </p>
    </section>
  );
}
function HostTeams({
  room,
  code,
  act,
}: {
  room: Room;
  code: string;
  act: Act;
}) {
  const [assign, setAssign] = useState<Record<string, string>>({});
  return (
    <section className="panel">
      <h2>
        Team operations{" "}
        <span className="pill">
          {Object.keys(room.members ?? {}).length}/50 players
        </span>
      </h2>
      <h3>Admission queue</h3>
      {Object.entries(room.joinRequests ?? {}).map(([uid, req]) => (
        <div className="request" key={uid}>
          <strong>{req.name}</strong>
          <select
            aria-label={`Team for ${req.name}`}
            value={assign[uid] ?? Object.keys(room.public.teams)[0]}
            onChange={(e) => setAssign({ ...assign, [uid]: e.target.value })}
          >
            {Object.entries(room.public.teams).map(([id, t]) => (
              <option key={id} value={id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            disabled={room.public.status !== "lobby"}
            onClick={() =>
              void act(
                () =>
                  admit(
                    code,
                    uid,
                    assign[uid] ?? Object.keys(room.public.teams)[0],
                  ),
                "Player admitted.",
              )
            }
          >
            Admit
          </button>
          <button
            className="secondary"
            onClick={() =>
              void act(
                () => set(path(`rooms/${code}/joinRequests/${uid}`), null),
                "Request declined.",
              )
            }
          >
            Decline
          </button>
        </div>
      ))}
      {!Object.keys(room.joinRequests ?? {}).length && (
        <p className="muted">
          No pending requests. Players enter the code at /play.
        </p>
      )}
      {Object.entries(room.public.teams).map(([id, team]) => (
        <div className="team-admin" key={id}>
          <label>
            Team name
            <input
              aria-label={`Rename ${id}`}
              defaultValue={team.name}
              key={`${id}-${team.name}`}
              maxLength={32}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== team.name)
                  void act(() =>
                    set(path(`rooms/${code}/public/teams/${id}/name`), name),
                  );
              }}
            />
          </label>
          <label>
            Captain
            <select
              aria-label={`Captain for ${team.name}`}
              value={team.captain}
              onChange={(e) =>
                void act(() =>
                  set(
                    path(`rooms/${code}/public/teams/${id}/captain`),
                    e.target.value,
                  ),
                )
              }
            >
              <option value="" disabled>
                Awaiting player
              </option>
              {Object.entries(team.roster ?? {}).map(([uid, name]) => (
                <option key={uid} value={uid}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <ul>
            {Object.entries(team.roster ?? {}).map(([uid, name]) => (
              <li key={uid}>
                {name}{" "}
                {uid === team.captain && <span className="pill">Captain</span>}
                <button
                  className="text-button"
                  disabled={room.public.status !== "lobby"}
                  onClick={() =>
                    void act(() => removePlayer(code, uid), "Player removed.")
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
function HostReview({
  room,
  code,
  pack,
  act,
}: {
  room: Room;
  code: string;
  pack: CasePack;
  act: Act;
}) {
  const [subjective, setSubjective] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState(0);
  return (
    <section className="panel">
      <div className="section-title">
        <h2>Submission review & scoring</h2>
        <label>
          Review phase
          <select
            aria-label="Review phase"
            value={phase}
            onChange={(e) => setPhase(Number(e.target.value))}
          >
            {PHASES.map((p, i) => (
              <option key={p.name} value={i}>
                {i + 1}. {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        Objective answers use the predefined key. Award explanation points only
        after reviewing reasoning: 20 for a coherent causal chain, 20 for
        specific evidence citations, 20 for resolving the red herrings.
      </p>
      <div className="review-grid">
        {Object.entries(room.public.teams).map(([id, team]) => {
          const sub = room.teams?.[id]?.submissions?.[phase];
          return (
            <article className="review" key={id}>
              <h3>{team.name}</h3>
              {!sub ? (
                <p className="muted">No official submission.</p>
              ) : (
                <>
                  <dl>
                    {pack.questions[phase].map((q) => (
                      <div key={q.id}>
                        <dt>{q.prompt}</dt>
                        <dd>
                          {phase === 3
                            ? pack.events.find(
                                (e) => e.id === sub.answers[q.id],
                              )?.label
                            : sub.answers[q.id] || "No answer"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="explanation">
                    {sub.explanation || "No written explanation."}
                  </p>
                  {phase === 4 && (
                    <label>
                      Explanation points (0–60)
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={subjective[id] ?? 0}
                        onChange={(e) =>
                          setSubjective({
                            ...subjective,
                            [id]: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  )}
                  <button
                    onClick={() =>
                      void act(
                        () => award(code, id, phase, pack, subjective[id] ?? 0),
                        "Score reviewed and published.",
                      )
                    }
                  >
                    Award / update score
                  </button>
                  <p>Published: {team.scores?.[phase] ?? "Not reviewed"}</p>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
function Player() {
  const { user, error } = useUser(true);
  const [code, setCode] = useState(
    () => localStorage.getItem("detective-player-code") ?? "",
  );
  const [name, setName] = useState("");
  const action = useAction();
  const { now, connected } = useClock();
  const session = useValue<Session>(
    user && code ? `rooms/${code}/public` : null,
  );
  const member = useValue<Member>(
    user && code ? `rooms/${code}/members/${user.uid}` : null,
  );
  const request = useValue<{ name: string }>(
    user && code ? `rooms/${code}/joinRequests/${user.uid}` : null,
  );
  const teamId = member.value?.teamId;
  const team = useValue<TeamPrivate>(
    user && code && teamId ? `rooms/${code}/teams/${teamId}` : null,
  );
  const presence = useValue<Record<string, boolean>>(
    user && code && teamId ? `rooms/${code}/presence/${teamId}` : null,
  );
  const personal = useValue<string>(
    user && code && member.value ? `rooms/${code}/personal/${user.uid}` : null,
  );
  useEffect(() => {
    if (!user || !code || !teamId || !connected) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void connectPresence(code, teamId, user.uid)
      .then((stop) => {
        if (cancelled) stop();
        else cleanup = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [code, teamId, user?.uid, connected]);
  function clear() {
    setCode("");
    localStorage.removeItem("detective-player-code");
  }
  return (
    <Shell role="Player">
      <Message>
        {error || action.notice || session.error || member.error || team.error}
      </Message>
      {!code ? (
        <>
          <Intro eyebrow="INVESTIGATOR ACCESS" title="Your team is waiting.">
            <p>
              Enter the host’s six-character code. Reconnection uses this
              browser’s saved identity; keep this browser session to retain your
              team.
            </p>
          </Intro>
          <section className="panel auth-form">
            <CodeForm
              label="Find game"
              onCode={(v) => {
                setCode(v);
                localStorage.setItem("detective-player-code", v);
              }}
            />
          </section>
        </>
      ) : !session.value ? (
        <section className="panel">
          <h1>{session.loading ? "Opening case…" : "Game not found"}</h1>
          <p>Check the code with your host.</p>
          <button onClick={clear}>Use another code</button>
        </section>
      ) : !member.value ? (
        <>
          <SessionHeader
            code={code}
            session={session.value}
            now={now}
            connected={connected}
          />
          <section className="panel auth-form">
            <h2>
              {request.value
                ? "Awaiting host admission"
                : "Register as an investigator"}
            </h2>
            <p>
              The host assigns your team. The first admitted player becomes its
              captain; the host can change this.
            </p>
            {request.value ? (
              <>
                <p>
                  Request sent as <strong>{request.value.name}</strong>. Keep
                  this screen open.
                </p>
                <button
                  className="secondary"
                  onClick={() =>
                    void action.act(
                      () =>
                        set(
                          path(`rooms/${code}/joinRequests/${user!.uid}`),
                          null,
                        ),
                      "Request cancelled.",
                    )
                  }
                >
                  Cancel request
                </button>
              </>
            ) : session.value.status === "lobby" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.act(
                    () =>
                      set(path(`rooms/${code}/joinRequests/${user!.uid}`), {
                        name: name.trim(),
                      }),
                    "Admission requested.",
                  );
                }}
              >
                <label>
                  Your name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={40}
                  />
                </label>
                <button disabled={!user || !name.trim() || action.busy}>
                  Request team assignment
                </button>
              </form>
            ) : (
              <p>Admission is closed until the host restarts the lobby.</p>
            )}
            <button className="text-button" onClick={clear}>
              Use another game code
            </button>
          </section>
        </>
      ) : (
        <>
          <SessionHeader
            code={code}
            session={session.value}
            now={now}
            connected={connected}
          />
          <div className="team-banner">
            <div>
              <span className="eyebrow">YOUR TEAM</span>
              <h2>
                {session.value.teams[teamId!]?.name}{" "}
                <span className="pill">
                  {session.value.teams[teamId!]?.captain === user?.uid
                    ? "Captain"
                    : "Investigator"}
                </span>
              </h2>
              <p>
                {Object.entries(session.value.teams[teamId!]?.roster ?? {})
                  .map(
                    ([uid, n]) => `${n}${presence.value?.[uid] ? " ●" : " ○"}`,
                  )
                  .join(" · ")}
              </p>
            </div>
            <button className="secondary" onClick={clear}>
              Switch game
            </button>
          </div>
          <div className="player-layout">
            <div>
              <EvidenceBoard session={session.value} />
              <Suspects session={session.value} />
              <Witnesses session={session.value} />
              <AnswerForm
                key={`${session.value.run}-${session.value.phase}-${teamId}`}
                code={code}
                session={session.value}
                teamId={teamId!}
                captain={session.value.teams[teamId!]?.captain === user?.uid}
                existing={team.value?.submissions?.[session.value.phase]}
                now={now}
                connected={connected}
                act={action.act}
              />
              <div className="two-col">
                <Notebook
                  key={`${code}-${teamId}-shared`}
                  title="Shared team notebook"
                  text={team.value?.notebook?.text ?? ""}
                  revision={team.value?.notebook?.revision ?? 0}
                  save={(text, rev) => saveNotebook(code, teamId!, text, rev)}
                />
                <Notebook
                  key={`${code}-personal`}
                  title="Personal detective notebook"
                  text={personal.value ?? ""}
                  revision={0}
                  save={(text) =>
                    set(path(`rooms/${code}/personal/${user!.uid}`), text)
                  }
                />
              </div>
              <Solution session={session.value} />
            </div>
            <aside>
              <Leaderboard session={session.value} />
              <section className="panel">
                <h2>Team submissions</h2>
                {PHASES.map((p, i) => (
                  <details key={p.name}>
                    <summary>
                      {p.name} ·{" "}
                      {team.value?.submissions?.[i] ? "Submitted" : "Pending"}
                    </summary>
                    <p>
                      Reviewed points:{" "}
                      {session.value!.teams[teamId!]?.scores?.[i] ??
                        "Awaiting review"}
                    </p>
                    <p className="explanation">
                      {team.value?.submissions?.[i]?.explanation}
                    </p>
                  </details>
                ))}
              </section>
            </aside>
          </div>
        </>
      )}
    </Shell>
  );
}
export function Notebook({
  title,
  text,
  revision,
  save,
}: {
  title: string;
  text: string;
  revision: number;
  save: (text: string, revision: number) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<{ text: string; revision: number } | null>(
    null,
  );
  const action = useAction();
  return (
    <section className="panel">
      <h2>{title}</h2>
      <label>
        {title}
        <textarea
          aria-label={title}
          rows={8}
          maxLength={8000}
          value={draft?.text ?? text}
          onChange={(e) =>
            setDraft({
              text: e.target.value,
              revision: draft?.revision ?? revision,
            })
          }
          placeholder="Connections, contradictions, working theories…"
        />
      </label>
      <div className="toolbar">
        <button
          disabled={!draft || action.busy}
          onClick={() =>
            void action.act(async () => {
              await save(draft!.text, draft!.revision);
              setDraft(null);
            }, "Notebook saved.")
          }
        >
          Save notes
        </button>
        <button className="secondary" onClick={() => setDraft(null)}>
          Reload latest
        </button>
      </div>
      {draft && draft.revision !== revision && (
        <p className="notice">
          A teammate saved a newer revision. Preserve your draft before
          reloading.
        </p>
      )}
      <Message>{action.notice}</Message>
    </section>
  );
}
export function AnswerForm({
  code,
  session,
  teamId,
  captain,
  existing,
  now,
  connected,
  act,
}: {
  code: string;
  session: Session;
  teamId: string;
  captain: boolean;
  existing?: Submission;
  now: number;
  connected: boolean;
  act: Act;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    existing?.answers ?? {},
  );
  const [explanation, setExplanation] = useState(existing?.explanation ?? "");
  const [order, setOrder] = useState<string[]>([]);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty && existing) {
      setAnswers(existing.answers);
      setExplanation(existing.explanation);
      if (session.phase === 3)
        setOrder([1, 2, 3, 4].map((i) => existing.answers[`slot${i}`]));
    }
  }, [existing, dirty, session.phase]);
  const questions = session.questions?.[session.phase] ?? [];
  const timeline = order.length
    ? order
    : (session.events?.map((e) => e.id) ?? []);
  const locked =
    session.status !== "running" || remaining(session, now) <= 0 || !connected;
  function move(id: string, target: number) {
    const list = [...timeline];
    const old = list.indexOf(id);
    if (old < 0 || target < 0 || target >= list.length) return;
    list.splice(old, 1);
    list.splice(target, 0, id);
    setOrder(list);
    setDirty(true);
  }
  const official =
    session.phase === 3
      ? Object.fromEntries(timeline.map((id, i) => [`slot${i + 1}`, id]))
      : answers;
  return (
    <section className="panel">
      <p className="eyebrow">OFFICIAL TEAM RESPONSE</p>
      <h2>{PHASES[session.phase].name}</h2>
      <p className="muted">
        {captain
          ? "You are the captain. Discuss with your team, then submit before the countdown ends. You can revise until the phase closes."
          : "Your captain submits the official answer. Everyone can investigate and add shared notes."}
      </p>
      {!questions.length ? (
        <p>Questions unlock when the host starts this phase.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await submit(code, teamId, session.phase, {
                answers: official,
                explanation,
                run: session.run,
                submittedAt: now,
              });
              setDirty(false);
            }, "Official team response submitted.");
          }}
        >
          <fieldset disabled={locked}>
            {session.phase === 3 ? (
              <>
                <p>
                  Arrange events from earliest to latest. Drag cards or use the
                  move buttons.
                </p>
                <ol className="timeline">
                  {timeline.map((id, i) => (
                    <li
                      key={id}
                      draggable={!locked}
                      onDragStart={() => setDragged(id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragged) move(dragged, i);
                        setDragged(null);
                      }}
                    >
                      <span className="rank">{i + 1}</span>
                      <span>
                        {session.events?.find((e) => e.id === id)?.label}
                      </span>
                      <div>
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`Move event ${i + 1} earlier`}
                          disabled={locked || i === 0}
                          onClick={() => move(id, i - 1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`Move event ${i + 1} later`}
                          disabled={locked || i === timeline.length - 1}
                          onClick={() => move(id, i + 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              questions.map((q) => (
                <label key={q.id}>
                  {q.prompt}
                  <select
                    aria-label={q.prompt}
                    required
                    value={answers[q.id] ?? ""}
                    onChange={(e) => {
                      setDirty(true);
                      setAnswers({ ...answers, [q.id]: e.target.value });
                    }}
                  >
                    <option value="" disabled>
                      Select your conclusion
                    </option>
                    {q.options.map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
              ))
            )}
            <label>
              {session.phase === 4
                ? "Logical explanation — cite evidence and resolve red herrings (60 host-reviewed points)"
                : "Investigation rationale / evidence citations"}
              <textarea
                aria-label={
                  session.phase === 4
                    ? "Logical explanation — cite evidence and resolve red herrings (60 host-reviewed points)"
                    : "Investigation rationale / evidence citations"
                }
                rows={5}
                maxLength={4000}
                required={session.phase === 4}
                value={explanation}
                onChange={(e) => {
                  setDirty(true);
                  setExplanation(e.target.value);
                }}
              />
            </label>
            <button disabled={locked || !captain}>
              Submit official response
            </button>
          </fieldset>
          {existing && (
            <p className="online">
              ✓ A response is saved for this phase.{" "}
              {dirty ? "Your current edits are not yet submitted." : ""}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
function Board() {
  const { user, error } = useUser(true);
  const [code, setCode] = useState(() => {
    try {
      return roomCode(new URLSearchParams(location.search).get("code") ?? "");
    } catch {
      return "";
    }
  });
  const session = useValue<Session>(
    user && code ? `rooms/${code}/public` : null,
  );
  const { now, connected } = useClock();
  return (
    <Shell role="Board">
      <Message>{error || session.error}</Message>
      {!code ? (
        <>
          <Intro
            eyebrow="AUDIENCE PRESENTATION"
            title="Follow the investigation."
          />
          <section className="panel auth-form">
            <CodeForm onCode={setCode} label="Open board" />
          </section>
        </>
      ) : !session.value ? (
        <section className="panel">
          <h1>{session.loading ? "Loading board…" : "Game not found"}</h1>
          <button onClick={() => setCode("")}>Try another code</button>
        </section>
      ) : (
        <>
          <SessionHeader
            code={code}
            session={session.value}
            now={now}
            connected={connected}
          />
          <Leaderboard session={session.value} />
          <Solution session={session.value} />
          <EvidenceBoard session={session.value} />
          <button className="secondary" onClick={() => setCode("")}>
            Change game
          </button>
        </>
      )}
    </Shell>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <Shell role="Setup">
        <Intro
          eyebrow="CONFIGURATION REQUIRED"
          title="Connect your Firebase workspace."
        >
          <p>{this.state.error}</p>
        </Intro>
        <section className="panel">
          <p>
            Configure the public Firebase web settings in{" "}
            <code>.env.local</code> using <code>.env.example</code>, or enable
            the local emulators. See DEVELOPMENT.md for exact commands.
          </p>
          <a href="/">Return home</a>
        </section>
      </Shell>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const route = location.pathname.replace(/\/$/, "") || "/";
  return (
    <ErrorBoundary>
      {route === "/host" ? (
        <Host />
      ) : route === "/play" ? (
        <Player />
      ) : route === "/board" ? (
        <Board />
      ) : route === "/" ? (
        <Home />
      ) : (
        <Shell role="404">
          <h1>Workspace not found</h1>
          <a href="/">Return home</a>
        </Shell>
      )}
    </ErrorBoundary>
  );
}
