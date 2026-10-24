# Validation evidence

Current cloud-workspace validation results (Firebase emulators; not production):

- `npm test`: **26 passed**, including all seven original Firebase configuration
  tests, case scoring/key tests, phase advancement regression and UI behavior checks.
- `npm run build`: strict TypeScript and Vite production build passed. The build
  check found no private solutions or unreleased evidence bodies in Hosting output.
- `npm run test:rules`: **21 passed** against the actual Realtime Database emulator.
  This includes unauthorized-access denial, team/personal data isolation, captain-only
  and deadline-limited submissions, atomic public progress, cold-client transactions,
  concurrent admissions, notebook conflict detection, phase transitions, score review,
  restart and host controls with saved notebooks and older submissions.
- `npm run test:e2e`: **2 passed** using system Chromium. The full multiplayer test
  used eight isolated browser contexts: six players, host and board. It completed all
  five phases, shared-note synchronization and team isolation, private notes,
  captain-only submissions, pause/resume, 1,000-point host-reviewed scoring,
  controlled solution revelation and browser identity restoration. It also checked
  mobile overflow; desktop/mobile screenshots remain local ignored test artifacts.
- `npm run format:check` and `git diff --check` passed.
- The cloud SDK's HTTP proxy variables had to be unset **for these local emulator
  test processes only**, since the Node Firebase WebSocket client otherwise sends
  loopback traffic through the proxy. Normal Windows users without such a proxy can
  run the npm commands directly. No persistent environment settings or TLS/artifact
  verification were changed for this workaround.
- GitHub Actions is configured to repeat build, unit, rules/service and browser tests.
  These results describe actual local execution, not a verified remote Actions run.
- No production Firebase deployment was performed. Emulator success does not establish
  production configuration or a public deployment URL. See DEVELOPMENT.md for
  production provisioning and deployment.

The security-test `permission_denied` warnings are expected for intentionally
unauthorized requests; the runner's final pass/fail summary determines the outcome.
The original user's run (12 passed, 4 failed) exposed a cold-cache transaction abort.
The fixes load transaction data, advance the stored phase with its evidence, preserve
host controls when existing notes/submissions are revalidated, and use stable accessible
form labels. Regression and browser checks above ran after those fixes.

## Dependency audit

`npm audit --omit=dev --audit-level=high` reports four high-severity findings in the
Firebase 12 umbrella package's transitive Firestore / Node gRPC dependency chain
(`@grpc/grpc-js` 1.9.x). npm reports no fix available for this installed dependency
range. This app imports only Firebase App, Authentication and Realtime Database;
Firestore and Node gRPC are not part of its browser bundle. No verification was
disabled and no forced version override was applied. Review the upstream advisory
and a compatible Firebase upgrade before adopting Node/Firestore functionality.
