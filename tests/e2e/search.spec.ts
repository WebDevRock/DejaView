import { expect, test } from "@playwright/test";
test("searches exact errors with a clear source label", async ({
  page,
  request,
}) => {
  const createdResponse = await request.post("/api/v1/articles/quick", {
    data: {
      problem: "Payroll export fails",
      symptomsOrError: "SQLSTATE 42P01",
      whatFixedIt: "Restore the payroll view",
      applications: ["Payroll"],
      tags: ["Database"],
    },
  });
  expect(createdResponse.ok()).toBeTruthy();
  const created = (await createdResponse.json()).data;
  const publishedResponse = await request.post(
    `/api/v1/articles/${created.id}/publish`,
    { data: { version: created.version } },
  );
  expect(publishedResponse.ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("searchbox").fill('"SQLSTATE 42P01"');
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/search/);
  const resultCard = page.locator("article").filter({
    has: page.locator(`a[href="/knowledge/${created.id}"]`),
  });
  await expect(resultCard).toBeVisible();
  await expect(
    resultCard.getByText("DejaView knowledge", { exact: true }),
  ).toBeVisible();
  await expect(resultCard.getByText("Exact match")).toBeVisible();
});
