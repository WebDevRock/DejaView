import { expect, test } from "@playwright/test";

test("turns an unlinked resolved case into a draft and records No history", async ({
  page,
}) => {
  const unique = `Case ${Date.now()}`;
  await page.goto("/cases/new");
  await page.getByLabel("Title").fill(unique);
  await page.getByLabel("Description").fill("Export returned E42");
  await page.getByLabel("When did it occur?").fill("2026-08-28T10:00");
  await page.getByLabel("What was tried").fill("Restarted the service");
  await page.getByRole("button", { name: "Save case" }).click();
  await expect(page).toHaveURL(/\/cases\/.+$/);
  await expect(page.getByRole("heading", { name: unique })).toBeVisible();
  await page.getByLabel("Resolution notes").fill("Restored the export view");
  await page.getByRole("button", { name: "Resolve case" }).click();
  await expect(page.getByText("Resolved", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit case" })).toHaveCount(0);

  await page.getByRole("button", { name: "Create draft article" }).click();
  await expect(page).toHaveURL(/\/knowledge\/.+$/);
  await page
    .getByLabel("What was different? (optional)")
    .fill("Different schema");
  await page.getByRole("button", { name: "No" }).click();
  await expect(page.getByRole("status")).toHaveText("Feedback recorded");
  await expect(page.getByText("Used 0 times")).toBeVisible();
  await expect(page.getByText("Feedback history (1)")).toBeVisible();
  await page.getByText("Feedback history (1)").click();
  await expect(page.getByText(/Not useful — Different schema/)).toBeVisible();
});

test("shows a related published article", async ({ page, request }) => {
  const unique = `Related ${Date.now()}`;
  const create = async (problem: string) => {
    const response = await request.post("/api/v1/articles/quick", {
      data: { problem, whatFixedIt: "Known repair", applications: [unique] },
    });
    expect(response.ok()).toBeTruthy();
    const article = (await response.json()).data;
    expect(
      (
        await request.post(`/api/v1/articles/${article.id}/publish`, {
          data: { version: article.version },
        })
      ).ok(),
    ).toBeTruthy();
    return article;
  };
  const source = await create(`${unique} source`);
  await create(`${unique} related`);
  await page.goto(`/knowledge/${source.id}`);
  await expect(page.getByText(`${unique} related`)).toBeVisible();
  await expect(page.getByText(`Shared application: ${unique}`)).toBeVisible();
});
