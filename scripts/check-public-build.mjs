import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
function contents(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? contents(join(dir, entry.name))
      : [readFileSync(join(dir, entry.name), "utf8")],
  );
}
const output = contents("dist").join("\n");
const packs = JSON.parse(readFileSync("private/case-packs.json", "utf8"));
for (const pack of packs) {
  for (const secret of [pack.solution, ...pack.evidence.map((e) => e.body)]) {
    if (
      output.includes(secret) ||
      output.includes(JSON.stringify(secret).slice(1, -1))
    )
      throw new Error(
        `Private case content leaked into Hosting build: ${pack.id}`,
      );
  }
}
console.log(
  "Public build contains no private case solutions or unreleased evidence bodies.",
);
