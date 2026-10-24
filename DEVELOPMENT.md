# The Detective Room

A React + TypeScript + Tailwind application backed by Firebase Authentication and
Realtime Database. Hosting is a static Vite build. No Cloud Functions, paid APIs,
server runtime, or Blaze-only Firebase features are used.

## Quick start (local, no cloud credentials)

Use Node.js 22+ and Java 21+ (for the database emulator).

```sh
npm ci
npm run build
npm test
npm run emulators
```

In a second terminal:

```sh
npm run seed:emulator
VITE_USE_FIREBASE_EMULATORS=true npm run dev
```

Open the local app in your browser. Sign in at `/host` as
`host@detective.test` / `local-demo-only-123`. These are **local emulator fixtures**,
not production credentials. The seed script only contacts 127.0.0.1 and loads the
three official case packs into that host's private library. It is repeatable and
does not erase existing games. Emulator processes do not survive new tasks.

The emulator download requires `storage.googleapis.com`. Its binary integrity and
TLS checks remain enabled. Cache and CLI configuration go in ignored `.firebase/`.
Each cloud task is isolated: use the existing checkout; do not create a worktree
unless explicitly requested.

## Play a game

1. Host signs in, imports `private/case-packs.json` if the library is not seeded,
   chooses a case and 2–10 teams, and creates an investigation.
2. Players visit `/play`, enter the six-character code, and request admission with
   a name. The host assigns each player to a team. First admitted is captain;
   the host can rename teams, change captains, remove players in the lobby, and
   decline requests. Reassign a player by removing and admitting again in the lobby.
3. Admit 6–50 players and populate every team. Start the investigation. Display
   `/board?code=CODE` on a presentation screen. Use separate browser profiles or
   contexts for independent identities; ordinary tabs share their Firebase identity.
4. Five phases run for 5/7/6/6/6 minutes. Countdown uses a server-time offset and
   one stored deadline, not per-second database writes. Expiry locks submissions
   in security rules; the host explicitly advances. Pause/resume preserves time.
5. Each phase releases its questions and the scheduled evidence batch. The host
   can release individual evidence cards early. All team members inspect evidence,
   question witnesses, draft answers and reorder timeline events. Only the current
   captain can submit an official answer, and can revise it until the phase closes.
6. Team notebooks use explicit saves and revision transactions. On conflict, copy
   your draft, reload the latest version and merge. Personal notebooks are private
   to the authenticated player (the trusted host can administratively read room data).
7. Host reviews each phase's submissions, applies the fixed key and awards points.
   Re-awarding replaces that phase's score; it never adds duplicate points. Final
   explanation points are manually awarded: 20 for the causal chain, 20 for specific
   citations, 20 for resolving red herrings. No explanation points are automatic.
8. Close the final phase, review all scores, then reveal the solution. Until revelation,
   the board has only public state, evidence, progress markers and reviewed scores.
   Restart returns the same case to the lobby, keeps the roster and personal notes,
   increments the run, and clears evidence, scores, team notebooks and submissions.

Reconnect by returning to the same browser and code. Authentication is persisted by
the Firebase SDK; presence is restored on database reconnect using `onDisconnect`.
Clearing browser storage or switching devices creates a new anonymous identity: the
host must admit that identity and, if needed, replace the old roster entry. There is
no insecure name-based identity recovery. Unsaved notebook drafts are local to the
current page and are lost on reload; save before navigating.

## Tests

```sh
npm test                         # 7 preserved configuration tests + game/key tests
npm run build                    # strict TypeScript + production bundle
npm run test:rules               # database emulator, actual rules + service integration
```

With Auth and Database emulators already running (`npm run emulators`):

```sh
npx playwright install chromium  # once, if a browser is not installed
npm run test:integration
```

On machines with system Chromium, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` instead. Browser tests launch
an emulator-configured Vite server on 5180. The multiplayer test uses eight isolated
browser contexts (host, board, six players) and completes all five phases, team and
personal note isolation, captain-only submission, manual scoring, revelation and
identity restoration. Test fixtures target `demo-detective-room` only.

## Production setup (Spark)

1. Create a Firebase project on the Spark plan, register a web app, enable
   Email/Password and Anonymous sign-in in Firebase Authentication, and create a
   Realtime Database in locked mode. Restrict authorized Auth domains appropriately.
2. Create the host's Email/Password account in Firebase Console. Record its UID.
   Project administrators provision hosts out of band; the app cannot promote users.
   Using Firebase Console Realtime Database editor, set `/hosts/HOST_UID` to boolean
   `true`. Never allow public writes to `/hosts`. To revoke a host, remove that entry.
3. Copy `.env.example` to ignored `.env.local`, populate the five public web config
   values, and leave `VITE_USE_FIREBASE_EMULATORS=false`. Set databaseURL to the actual
   regional database URL shown by Firebase. Web config is not a service-account key;
   all access still requires Authentication and database rules. Never embed Admin SDK
   credentials or host passwords in Vite variables.
4. From a trusted authenticated workstation:

```sh
npx firebase login
npm ci
npm test
npm run test:rules
npm run build
npx firebase deploy --project YOUR_PROJECT_ID --only database,hosting
```

5. Confirm the actual URL printed by Firebase, open `/host`, sign in and import
   `private/case-packs.json`. Run a real multi-device smoke game before inviting an
   office. The repository's private JSON is intentionally **not imported by the app**
   and is outside Hosting's `dist` directory. Do not copy it into `public` or `dist`.
   Restrict repository access if players should not know the answer keys.

No Firebase project is bound in `.firebaserc`. Deployment requires your own project,
secure CLI authentication and explicit project selection. No deployment is implied
by a successful local build or emulator test. Verify the built `dist` does not contain
case keys before deploying. No GitHub Actions auto-deploy or credentials are included.

## Security and free-tier boundaries

- `/hosts` is administrator-provisioned. Host role checks are enforced by database
  rules even if someone bypasses the UI or authenticates with another email account.
- `/libraries/UID` holds private case packs. Only that allowlisted host can read/write.
  Public clients cannot enumerate rooms or read full room roots. Knowing a code permits
  authenticated public-board access; codes are shareable invitation codes, not secrets.
- Only the host mutates session state, admissions, assignments, captains, scores,
  evidence releases and revelations. Player submission rules check membership,
  captain, current phase, server deadline, running status and run version.
- Team data is scoped to team members. Personal notes are scoped to their owner.
  Public roster names and team progress are intentionally visible on the board.
  Never enter sensitive employee or customer information into fictional case games.
- Creation, admissions, phase transitions, restart and score updates use transactions.
  Notes use compare-and-swap revisions; submission and public progress update atomically.
  Progress cannot be written without a corresponding submission. Scores are host-only.
- A trusted host is authoritative: a modified host client can change scores, phases,
  content, or reveal answers early. Security rules protect players against other players,
  not against their host or project administrator. There is no server-secret scoring
  oracle, automatic scheduled job, anti-collusion guarantee or strong anti-cheat system.
  Hosts review objective scoring in their client and subjective reasoning themselves.
- Spark Realtime Database has a published limit of 100 simultaneous connections,
  1 GB stored data and 10 GB/month downloaded data. A 50-player game + host + board
  uses about 52 connections with one tab each. Multiple games, extra tabs and development
  clients share the project quota. Firebase quotas can change: verify the current
  Console usage and pricing before a large event. No load-test here establishes a
  production quota guarantee. Shared-office IPs may encounter anonymous sign-up abuse
  throttling; reuse saved identities and stagger first-time joins.
- Static cases contain 12 small evidence cards. Clients subscribe to the public state,
  own membership/request, own team, personal notes and team presence, all multiplexed
  over the same database connection. No root listener is used by players or the board.
  Notes save explicitly; timers do not write ticks. The host listens to its single room.
  Scores are small per-phase maps, not append-only event streams.
- There is no background retention worker on Spark. After exporting anything needed,
  delete finished rooms and stale anonymous accounts in Firebase Console. Monitor Hosting
  storage/transfer as well as database traffic. Hosting free allowances and Firebase
  Auth abuse protections apply independently; no client app can enforce project-wide
  billing quotas or prevent determined anonymous sign-up/room-code guessing abuse.
  For untrusted public events, add a reviewed App Check/abuse strategy before launch.

## Case authoring

`private/case-packs.json` contains all three complete mysteries, with five suspects,
12 evidence cards, prepared witness exchanges, four timeline events, five phase keys
and one final explanation each. Schema/scoring integrity is validated on import and by
automated tests. Human review is still required for editorial quality and deductive fairness.
