import { test, expect } from "@playwright/test";
test("responsive entry points and accessible route navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Every detail tells a story." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Host an investigation/ }),
  ).toHaveAttribute("href", "/host");
  await expect(
    page.getByRole("link", { name: /Join your team/ }),
  ).toHaveAttribute("href", "/play");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("link", { name: /Open the audience board/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.goto("/unknown");
  await expect(
    page.getByRole("heading", { name: "Workspace not found" }),
  ).toBeVisible();
});
