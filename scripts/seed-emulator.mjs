// Local-only fixture. Never accepts a production Firebase endpoint.
import { readFileSync } from "node:fs";
const project = "demo-detective-room";
const email = "host@detective.test";
const password = "local-demo-only-123";
export async function seedEmulator() {
  const authBase =
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:";
  let response = await fetch(`${authBase}signUp?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  let user = await response.json();
  if (!response.ok && user.error?.message === "EMAIL_EXISTS") {
    response = await fetch(`${authBase}signInWithPassword?key=demo-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    user = await response.json();
  }
  if (!response.ok)
    throw new Error(`Auth emulator seed failed: ${user.error?.message}`);
  const packs = JSON.parse(
    readFileSync(
      new URL("../private/case-packs.json", import.meta.url),
      "utf8",
    ),
  );
  const updates = {
    [`hosts/${user.localId}`]: true,
    [`libraries/${user.localId}`]: Object.fromEntries(
      packs.map((p) => [p.id, p]),
    ),
  };
  response = await fetch(
    `http://127.0.0.1:9000/.json?ns=${project}-default-rtdb`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner",
      },
      body: JSON.stringify(updates),
    },
  );
  if (!response.ok)
    throw new Error(`Database emulator seed failed: ${response.status}`);
  console.log(
    "Local emulator host ready: host@detective.test / local-demo-only-123",
  );
  return { uid: user.localId, email, password };
}
if (process.argv[1]?.endsWith("seed-emulator.mjs")) await seedEmulator();
