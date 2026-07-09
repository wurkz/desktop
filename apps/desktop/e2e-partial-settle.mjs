import { chromium } from "playwright";
import fs from "node:fs";

const ART = "e2e-artifacts";
fs.mkdirSync(ART, { recursive: true });

async function confirmDialog(page) {
  const btn = page.getByRole("button", { name: "Confirm", exact: true });
  await btn.waitFor({ timeout: 5000 });
  await btn.click();
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 420, height: 950 } });
  await page.goto("http://localhost:3030/#/login");
  await page.getByLabel("Username").fill("admin");
  await page.locator("input").nth(1).click();
  await page.keyboard.type("123456");
  await page.waitForURL(/#\/$/, { timeout: 10000 });
  await page.getByText("Quick Access").waitFor({ timeout: 10000 });

  // The ₱450 Cabin Air Filter payable is outstanding. Settle ₱200 (partial).
  await page.goto("http://localhost:3030/#/reports/payables");
  await page.getByText("Total owed to suppliers").waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Settle" }).first().click();
  await page.waitForURL(/#\/expenses$/, { timeout: 5000 });
  const amtInput = page.getByLabel("Amount");
  await amtInput.waitFor();
  console.log("prefilled balance:", await amtInput.inputValue()); // expect 450
  await amtInput.fill("200");
  await page.getByRole("button", { name: /^Save|^Record|Add Expense/ }).click();
  await confirmDialog(page);
  // Should land back on the payables page (cancel/save handoff return)
  await page.waitForURL(/#\/reports\/payables$/, { timeout: 5000 });
  console.log("returned to payables after save: true");
  await page.waitForTimeout(1200);
  let txt = await page.locator("main").innerText();
  console.log("shows partial:", txt.includes("partially paid"), "| remaining 250:", txt.includes("250.00"));
  await page.screenshot({ path: `${ART}/partial-payable.png`, fullPage: true });

  // Over-payment guard: try settling 999 (> 250 remaining)
  await page.getByRole("button", { name: "Settle" }).first().click();
  await page.waitForURL(/#\/expenses$/, { timeout: 5000 });
  console.log("prefilled remaining:", await page.getByLabel("Amount").inputValue()); // expect 250
  await page.getByLabel("Amount").fill("999");
  await page.getByRole("button", { name: /^Save|^Record|Add Expense/ }).click();
  await page.getByText("More than the remaining balance").waitFor({ timeout: 5000 });
  console.log("over-payment blocked: true");

  // Cancel → must return to payables page (the reported bug)
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForURL(/#\/reports\/payables$/, { timeout: 5000 });
  console.log("cancel returns to payables: true");

  // Pay the remaining 250 → payable fully clears
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Settle" }).first().click();
  await page.waitForURL(/#\/expenses$/, { timeout: 5000 });
  await page.getByRole("button", { name: /^Save|^Record|Add Expense/ }).click();
  await confirmDialog(page);
  await page.waitForURL(/#\/reports\/payables$/, { timeout: 5000 });
  await page.waitForTimeout(1200);
  txt = await page.locator("main").innerText();
  console.log("all payables cleared:", txt.includes("No outstanding on-account receives"));
  await page.screenshot({ path: `${ART}/payables-cleared.png` });
} finally {
  await browser.close();
}
console.log("DONE");
