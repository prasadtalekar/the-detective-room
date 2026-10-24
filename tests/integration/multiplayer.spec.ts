import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
test("six investigators, two teams and one board complete a live case", async ({
  browser,
}) => {
  execFileSync(process.execPath, ["scripts/seed-emulator.mjs"], {
    stdio: "pipe",
  });
  const contexts = await Promise.all(
    Array.from({ length: 8 }, () => browser.newContext()),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [host, board, ...players] = pages;
  try {
    await host.goto("/host");
    await host.getByLabel("Email", { exact: true }).fill("host@detective.test");
    await host
      .getByLabel("Password", { exact: true })
      .fill("local-demo-only-123");
    await host.getByRole("button", { name: "Sign in", exact: true }).click();
    await host
      .getByRole("button", { name: "Create investigation", exact: true })
      .click();
    const code = (await host.locator(".code-box strong").innerText()).trim();
    await board.goto(`/board?code=${code}`);
    await expect(
      board.getByRole("heading", {
        name: "The Missing Project Aurora Document",
        exact: true,
      }),
    ).toBeVisible();
    for (let i = 0; i < 6; i++) {
      const p = players[i];
      await p.goto("/play");
      await p.getByLabel("Game code", { exact: true }).fill(code);
      await p.getByRole("button", { name: "Find game", exact: true }).click();
      await p
        .getByLabel("Your name", { exact: true })
        .fill(`Investigator ${i + 1}`);
      await p
        .getByRole("button", { name: "Request team assignment", exact: true })
        .click();
      await host
        .getByLabel(`Team for Investigator ${i + 1}`, { exact: true })
        .selectOption(i < 3 ? "t1" : "t2");
      await host
        .locator(".request")
        .filter({ hasText: `Investigator ${i + 1}` })
        .getByRole("button", { name: "Admit", exact: true })
        .click();
      await expect(p.locator(".team-banner")).toContainText(
        i < 3 ? "Team 1" : "Team 2",
      );
    }
    await host
      .getByRole("button", { name: "Start investigation", exact: true })
      .click();
    await expect(
      players[0].getByRole("heading", { name: "Document audit", exact: true }),
    ).toBeVisible();
    await expect(
      players[1].getByRole("button", {
        name: "Submit official response",
        exact: true,
      }),
    ).toBeDisabled();
    await players[0]
      .getByLabel("Shared team notebook", { exact: true })
      .fill("L-17 links the access and gateway records.");
    await players[0]
      .locator("section")
      .filter({
        has: players[0].getByRole("heading", {
          name: "Shared team notebook",
          exact: true,
        }),
      })
      .getByRole("button", { name: "Save notes", exact: true })
      .click();
    await expect(
      players[1].getByLabel("Shared team notebook", { exact: true }),
    ).toHaveValue("L-17 links the access and gateway records.");
    await expect(
      players[3].getByLabel("Shared team notebook", { exact: true }),
    ).toHaveValue("");
    await players[0]
      .getByLabel("Personal detective notebook", { exact: true })
      .fill("Private observation.");
    await players[0]
      .locator("section")
      .filter({
        has: players[0].getByRole("heading", {
          name: "Personal detective notebook",
          exact: true,
        }),
      })
      .getByRole("button", { name: "Save notes", exact: true })
      .click();
    await expect(
      players[1].getByLabel("Personal detective notebook", { exact: true }),
    ).toHaveValue("");
    await host.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      players[0].getByRole("button", {
        name: "Submit official response",
        exact: true,
      }),
    ).toBeDisabled();
    await host.getByRole("button", { name: "Resume", exact: true }).click();
    const pack = JSON.parse(readFileSync("private/case-packs.json", "utf8"))[0];
    for (let phase = 0; phase < 5; phase++) {
      const p = players[0];
      if (phase === 3) {
        // Accessible move controls reconstruct the same order as dragging.
        for (let target = 0; target < 4; target++) {
          const label = pack.events.find(
            (e: { id: string }) => e.id === `event${target + 1}`,
          ).label;
          let index = await p
            .locator(".timeline li")
            .evaluateAll(
              (rows, text) =>
                rows.findIndex((r) => r.textContent?.includes(text)),
              label,
            );
          while (index > target) {
            await p
              .getByRole("button", {
                name: `Move event ${index + 1} earlier`,
                exact: true,
              })
              .click();
            index--;
          }
        }
      } else
        for (const key of pack.key[phase]) {
          const question = pack.questions[phase].find(
            (q: { id: string }) => q.id === key.id,
          );
          await p
            .getByLabel(question.prompt, { exact: true })
            .selectOption(key.answer);
        }
      await p
        .getByLabel(
          phase === 4
            ? "Logical explanation — cite evidence and resolve red herrings (60 host-reviewed points)"
            : "Investigation rationale / evidence citations",
          { exact: true },
        )
        .fill(
          "The matching digest, certificate D-17 and CCTV connect Daniel to the upload. His referral message establishes motive; the service print and audit read are red herrings.",
        );
      await p
        .getByRole("button", { name: "Submit official response", exact: true })
        .click();
      await expect(p.getByRole("status")).toContainText(
        "Official team response submitted.",
      );
      await host
        .getByLabel("Review phase", { exact: true })
        .selectOption(String(phase));
      const review = host.locator(".review").filter({
        has: host.getByRole("heading", { name: "Team 1", exact: true }),
      });
      if (phase === 4)
        await review
          .getByLabel("Explanation points (0–60)", { exact: true })
          .fill("60");
      await review
        .getByRole("button", { name: "Award / update score", exact: true })
        .click();
      await expect(review).toContainText(
        `Published: ${[100, 150, 150, 200, 400][phase]}`,
      );
      host.once("dialog", (d) => d.accept());
      await host
        .getByRole("button", {
          name: phase === 4 ? "Close investigation" : "Next phase",
          exact: true,
        })
        .click();
    }
    await expect(board.locator(".leaderboard")).toContainText("1000");
    await expect(
      board.getByRole("heading", {
        name: "The complete explanation",
        exact: true,
      }),
    ).toHaveCount(0);
    host.once("dialog", (d) => d.accept());
    await host
      .getByRole("button", { name: "Reveal solution", exact: true })
      .click();
    await expect(
      board.getByRole("heading", {
        name: "The complete explanation",
        exact: true,
      }),
    ).toBeVisible();
    await players[0].reload();
    await expect(players[0].locator(".team-banner")).toContainText("Team 1");
    await expect(
      players[0].getByLabel("Personal detective notebook", { exact: true }),
    ).toHaveValue("Private observation.");
    await host.screenshot({
      path: "test-results/host-completed.png",
      fullPage: true,
    });
    await board.screenshot({
      path: "test-results/board-completed.png",
      fullPage: true,
    });
    await players[0].setViewportSize({ width: 390, height: 844 });
    expect(
      await players[0].evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await players[0].screenshot({
      path: "test-results/player-mobile.png",
      fullPage: true,
    });
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
