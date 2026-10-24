# The Detective Room

A competitive investigation game for 6–50 players in 2–10 teams. React, TypeScript,
Tailwind CSS, Firebase Authentication, Realtime Database and Hosting (Spark).

- **/host**: authenticated operations, admission, captains, timed phases, evidence
  release, submission review, fixed-key scoring and final revelation.
- **/play**: evidence and suspects, prepared witness interrogation, accessible
  timeline reconstruction, shared/personal notes and captain-only official answers.
- **/board**: public evidence, timer, team progress, scores and revealed explanation.

Three included cases: **The Missing Project Aurora Document**, **The Vanishing
Prototype**, and **The Impossible Meeting**. Each has five phases and 1,000 possible
points. Subjective explanation points always require host review.

```sh
npm ci
npm run build
npm test
npm run emulators
# Second terminal:
npm run seed:emulator
VITE_USE_FIREBASE_EMULATORS=true npm run dev
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for local host credentials, gameplay, secure
production provisioning, deployment commands and free-tier limitations.
See [VALIDATION.md](VALIDATION.md) for actual test results and outstanding checks.

Private case packs live outside Hosting output and must be imported into the host-only
Firebase library. Keep repository access restricted if participants should not see keys.
No production Firebase project or deployment is included.
