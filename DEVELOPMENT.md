# Development foundation

This scaffold uses React, TypeScript, Vite, Tailwind CSS, and the Firebase web SDK.
Gameplay is pending the previously approved design, which is not included in the repository.
The current screen is a setup placeholder, not an implemented game.

## Local workflow

Use Node.js 22 or newer. Run `npm ci`, then `npm run dev`.
Run `npm run build` and `npm test` to check the foundation.

For local Firebase development, copy `.env.example` to `.env.local` and set
`VITE_USE_FIREBASE_EMULATORS=true`. Run `npm run build`, then `npm run emulators`
in another terminal. Emulator mode uses the demo project and needs no production credentials.
The current rules deny all reads and writes until the approved game schema and authorization
model are implemented and tested.

## Firebase Spark deployment prerequisites

Create a Firebase project on the Spark plan, register a web application, create a
Realtime Database, and enable anonymous Authentication if required by the approved design.
Copy the public web configuration into `.env.local`; never include service-account keys.
Use `npx firebase login` in a trusted interactive environment, then
`npx firebase deploy --project YOUR_PROJECT_ID --only hosting,database` after game
implementation and rules tests are complete. No deployment has been performed.

The intended architecture uses Firebase Hosting and direct Realtime Database clients,
without Cloud Functions or a paid server. Firebase limits still apply; connection caps,
room retention, listener scope, and abuse controls must be finalized with the game design.
Do not claim client-only scoring can hide secrets or prevent cheating by clients that
can read answer data. Those requirements need an explicit design decision.
