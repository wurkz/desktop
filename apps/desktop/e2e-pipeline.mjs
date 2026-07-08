// Part 2: prove the movement log — finish the seeded in-progress job (ticks + Mark as Done
// = a real in_progress→done transition), sync, then the cloud should hold the history row.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SHOT_DIR = process.env.E2E_SHOT_DIR ?? "./e2e-artifacts";
const DESKTOP = "http://127.0.0.1:3030";

async function confirmDialog(page) {
    const btn = page.getByRole("button", { name: "Confirm", exact: true });
    await btn.waitFor({ state: "visible", timeout: 5000 });
    await btn.click();
}

mkdirSync(SHOT_DIR, { recursive: true });
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto(`${DESKTOP}/#/login`);
    await page.getByLabel("Username").fill("admin");
    await page.locator("input").nth(1).click();
    await page.keyboard.type("123456");
    await page.waitForURL(/#\/$/, { timeout: 10000 });

    // Open the in-progress job.
    await page.goto(`${DESKTOP}/#/jobs`);
    await page.getByRole("button", { name: "All", exact: true }).first().click();
    await page.getByRole("button", { name: "in progress", exact: true }).click();
    await page.locator("main .cursor-pointer").first().click();
    await page.waitForURL(/#\/repair\/ticket\//);

    // Tick every unfinished checklist row (big-row buttons, aria-pressed=false).
    await page.getByText("Work Checklist").waitFor({ timeout: 8000 });
    const unticked = page.locator('button[aria-pressed="false"]');
    while ((await unticked.count()) > 0) {
        await unticked.first().click();
        await page.waitForTimeout(400);
    }
    await page.getByRole("button", { name: "Mark as Done" }).click();
    await confirmDialog(page);
    await page.getByText("Billing").waitFor({ timeout: 8000 }); // done → Billing card appears
    await page.screenshot({ path: `${SHOT_DIR}/e2e-08-job-marked-done.png` });
    console.log("✓ job moved in_progress → done");

    // Sync.
    await page.goto(`${DESKTOP}/#/settings`);
    await page.getByRole("button", { name: "Sync now" }).click();
    await page.waitForTimeout(4000);
    console.log("✓ synced");
} finally {
    await browser.close();
}
