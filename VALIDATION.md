# Validation evidence

Current local results for this implementation:

- `npm test`: 25 tests passed, including all seven original Firebase configuration
  tests, three-case scoring/key checks and five UI behavior checks.
- `npm run build`: strict TypeScript and Vite production build passed. The build
  check found no private solutions or unreleased evidence bodies in Hosting output.
- Playwright `home.spec.ts` using system Chromium: passed; desktop/mobile entry
  points, navigation, 404 and mobile overflow checked. Screenshots are local ignored
  test artifacts, not deployment evidence.
- `npm run test:rules`: attempted, but **not executed**. Download of the official
  database emulator JAR returned HTTP 403 `Domain forbidden` from the environment
  proxy for `storage.googleapis.com`. The user approved adding this hostname and
  its draft was saved, but this does not apply the runtime network policy.
- The full eight-browser multiplayer test is implemented but **not executed** because
  it requires that database emulator. Run `npm run test:e2e` once download access is
  active. No claim of validated Firebase rules or end-to-end multiplayer is made.
- GitHub Actions is configured to repeat build, unit, rules/service and browser tests.
  Merely including that workflow does not establish that any remote run has passed.
- No production Firebase project or credentials are configured, and no Firebase
  deployment was attempted. See DEVELOPMENT.md for provisioning and deployment.

## Dependency audit

`npm audit --omit=dev --audit-level=high` reports four high-severity findings in the
Firebase 12 umbrella package's transitive Firestore / Node gRPC dependency chain
(`@grpc/grpc-js` 1.9.x). npm reports no fix available for this installed dependency
range. This app imports only Firebase App, Authentication and Realtime Database;
Firestore and Node gRPC are not part of its browser bundle. No verification was
disabled and no forced version override was applied. Review the upstream advisory
and a compatible Firebase upgrade before adopting Node/Firestore functionality.
