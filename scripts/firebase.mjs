// Keep emulator downloads/configuration in the ignored checkout-local cache.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const cache = resolve(".firebase");
mkdirSync(`${cache}/emulators`, { recursive: true });
mkdirSync(`${cache}/config`, { recursive: true });
const result = spawnSync(
  process.execPath,
  ["node_modules/firebase-tools/lib/bin/firebase.js", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      FIREBASE_EMULATORS_PATH: `${cache}/emulators`,
      XDG_CONFIG_HOME: `${cache}/config`,
      NO_UPDATE_NOTIFIER: "1",
    },
  },
);
process.exit(result.status ?? 1);
