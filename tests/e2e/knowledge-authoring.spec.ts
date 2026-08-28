import { expect, test } from "@playwright/test";

test("quick creates, edits, publishes and views a knowledge article", async ({
  page,
}) => {
  const unique = `Payroll export ${Date.now()}`;
  await page.goto("/knowledge/new");
  await page.getByLabel("What problem did you solve?").fill(unique);
  await page.getByLabel(/What symptoms or error/).fill("SQLSTATE 42P01");
  await page.getByLabel("What fixed it?").fill("Restore the reporting view");
  await page.getByLabel(/Applications/).fill("Payroll");
  await page.getByLabel(/Tags/).fill("Database");
  await page.getByRole("button", { name: "Create draft" }).click();

  await expect(page).toHaveURL(/\/knowledge\/.+\/edit/);
  await page
    .getByLabel("Summary", { exact: true })
    .fill("A tested payroll repair");
  await page.getByLabel("Step 1 type").selectOption("sql");
  await page.getByLabel("SQL", { exact: true }).fill("SELECT 1;");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByLabel("Step 2 type").selectOption("powershell");
  const secondStep = page.getByRole("group", { name: "Step 2" });
  await secondStep
    .getByLabel("Instruction", { exact: true })
    .fill("Verify from PowerShell");
  await secondStep
    .getByLabel("PowerShell", { exact: true })
    .fill("Invoke-Sqlcmd -Query 'SELECT 1'");
  await page.getByRole("button", { name: "Add edge" }).click();
  await page.getByRole("button", { name: "Save and publish" }).click();

  await expect(page).toHaveURL(/\/knowledge\/.+$/);
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: unique })).toBeVisible();
  await expect(page.getByText("SELECT 1;")).toBeVisible();
  await expect(page.getByText("Invoke-Sqlcmd -Query 'SELECT 1'")).toBeVisible();
  await expect(page.getByText("Payroll", { exact: true })).toBeVisible();
  await expect(page.getByText("Database", { exact: true })).toBeVisible();
});
