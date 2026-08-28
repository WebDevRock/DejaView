import { expect, test } from "@playwright/test";

test("shows the health page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DejaView" })).toBeVisible();
  await expect(page.getByText("Service healthy")).toBeVisible();
});
