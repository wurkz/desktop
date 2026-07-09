import { chromium } from "playwright";
import fs from "node:fs";

const ART = "e2e-artifacts";
fs.mkdirSync(ART, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.goto("http://localhost:3030/#/login");
  await page.getByLabel("Username").fill("admin");
  await page.locator("input").nth(1).click(); // first PIN box
  await page.keyboard.type("123456"); // auto-submits on complete
  await page.waitForURL(/#\/$/, { timeout: 10000 });
  await page.getByText("Quick Access").waitFor({ timeout: 10000 });

  // Reports tile visible on dashboard?
  const tile = page.getByRole("button", { name: /Reports/ });
  console.log("dashboard Reports tile:", await tile.count());
  await tile.first().click();
  await page.getByText("Profit & Loss Summary").waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${ART}/reports-page.png` });

  // Switch to This Week so E2E money data is in range
  await page.getByRole("button", { name: "All time" }).click();

  const cards = [
    ["Profit & Loss Summary", "pnl"],
    ["VAT Summary", "vat"],
    ["Senior / PWD Discount Record", "senior"],
    ["Mechanic Productivity", "mechanics"],
    ["Supplier Payables", "payables"],
  ];
  for (const [title, key] of cards) {
    const card = page.locator("div").filter({ hasText: title }).last();
    const btn = page
      .locator(`text=${title}`)
      .locator("xpath=ancestor::*[contains(@class,'p-4')][1]")
      .getByRole("button", { name: /PDF/ });
    const dl = page.waitForEvent("download", { timeout: 15000 });
    await btn.click();
    const d = await dl;
    const dest = `${ART}/${key}.pdf`;
    await d.saveAs(dest);
    console.log(`${key}: saved ${d.suggestedFilename()} -> ${dest}`);
    // wait for busy state to clear
    await page.waitForTimeout(400);
  }
} finally {
  await browser.close();
}
console.log("DONE");
