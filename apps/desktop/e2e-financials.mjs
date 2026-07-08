// One-shot E2E of the financial layer (BACK-3-010..013 + transition log) driven through the
// desktop's LAN browser surface (:3030, same-origin API) and the cloud dashboard (:8100).
// Run: node e2e-financials.mjs   (from apps/desktop)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SHOT_DIR = process.env.E2E_SHOT_DIR ?? "./e2e-artifacts";
const DESKTOP = "http://127.0.0.1:3030";
const CLOUD = "http://127.0.0.1:8100";
let step = 0;

async function shot(page, name) {
    step++;
    await page.screenshot({ path: `${SHOT_DIR}/e2e-${String(step).padStart(2, "0")}-${name}.png`, fullPage: false });
    console.log(`✓ ${step}. ${name}`);
}

// The app's slide-to-confirm renders a plain Confirm button on fine pointers (desktop).
async function confirmDialog(page) {
    const btn = page.getByRole("button", { name: "Confirm", exact: true });
    await btn.waitFor({ state: "visible", timeout: 5000 });
    await btn.click();
}

mkdirSync(SHOT_DIR, { recursive: true });
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

    // ---- A. Desktop: login as admin ----
    await page.goto(`${DESKTOP}/#/login`);
    await page.getByLabel("Username").fill("admin");
    await page.locator("input").nth(1).click(); // first PIN box
    await page.keyboard.type("123456"); // auto-submits on complete
    await page.waitForURL(/#\/$/, { timeout: 10000 });
    await page.waitForTimeout(800);
    await shot(page, "desktop-dashboard");

    // ---- B. Open Day (float 2,000) ----
    await page.getByRole("button", { name: "Open Day" }).click();
    await page.getByLabel("Opening float").fill("2000");
    await page.getByRole("button", { name: "Open Day" }).last().click();
    await confirmDialog(page);
    await page.getByText("Day opened").waitFor({ timeout: 5000 });
    await shot(page, "drawer-opened");

    // ---- C. Expense: parts 500 from drawer ----
    await page.getByRole("button", { name: /Expenses/ }).click();
    await page.waitForURL(/#\/expenses/);
    await page.getByRole("button", { name: "Add Expense" }).click();
    await page.getByRole("button", { name: "Parts purchase" }).click();
    await page.getByLabel("Amount").fill("500");
    await page.getByLabel("Note").fill("compressor restock (E2E)");
    await page.getByRole("button", { name: "Save Expense" }).click();
    await confirmDialog(page);
    await page.getByText("compressor restock (E2E)").waitFor({ timeout: 5000 });
    await shot(page, "expense-recorded");

    // ---- D. Partial payment (1,000 cash) on the done job ----
    await page.goto(`${DESKTOP}/#/jobs`);
    await page.getByRole("button", { name: "All", exact: true }).first().click(); // widen the date filter
    await page.getByRole("button", { name: "done", exact: true }).click(); // status chip
    await page.locator("main .cursor-pointer").first().click();
    await page.waitForURL(/#\/repair\/ticket\//);
    await page.getByRole("button", { name: "Mark as Paid" }).click();
    await page.getByRole("button", { name: "Partial" }).click();
    await page.getByLabel("Amount to pay now").fill("1000");
    await page.getByLabel("Amount tendered").fill("1000");
    await page.getByRole("button", { name: "Record Payment" }).last().click();
    await confirmDialog(page);
    await page.getByText("Balance due").waitFor({ timeout: 8000 });
    await shot(page, "partial-payment-balance-due");

    // ---- E. Close Day (2000 + 1000 cash − 500 expense = 2500 → balanced) ----
    await page.goto(`${DESKTOP}/#/`);
    await page.getByRole("button", { name: "Close Day" }).click();
    await page.getByLabel("Counted cash").fill("2500");
    await page.getByRole("button", { name: "Close Day" }).last().click();
    await confirmDialog(page);
    await page.getByText(/balanced exactly/).waitFor({ timeout: 5000 });
    await shot(page, "drawer-balanced");

    // ---- F. Sync now ----
    await page.goto(`${DESKTOP}/#/settings`);
    await page.getByRole("button", { name: "Sync now" }).click();
    await page.waitForTimeout(4000); // collect + push + watermark
    await shot(page, "synced");

    // ---- G. Cloud: verify the money story arrived ----
    const cloud = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await cloud.goto(`${CLOUD}/login`);
    await cloud.getByLabel("Email").fill("admin@zorviz.local");
    await cloud.getByLabel("Password").fill("zorviz-admin-2026");
    await cloud.getByRole("button", { name: "Sign in" }).click();
    await cloud.waitForLoadState("networkidle");
    await cloud.goto(`${CLOUD}/shops/a20b7cf1-9cf1-4f80-b734-50785bd09a9c`);
    await cloud.waitForLoadState("networkidle");

    const checks = [
        ["Expenses this month", "Expenses this month"],
        ["Profit this month", "Profit this month"],
        ["Receivables", "Receivables"],
        ["Drawer balanced", "Balanced"],
        ["Pipeline card", "Pipeline · last 30 days"],
        ["Movement logged", "Avg time in"],
    ];
    for (const [label, text] of checks) {
        const found = await cloud.getByText(text, { exact: false }).first().isVisible().catch(() => false);
        console.log(`${found ? "✓" : "✗"} cloud: ${label}`);
    }
    const expenses = await cloud.getByText("₱500.00").first().isVisible().catch(() => false);
    console.log(`${expenses ? "✓" : "✗"} cloud: expenses shows ₱500.00`);
    await shot(cloud, "cloud-dashboard-final");

    console.log("\nE2E COMPLETE");
} finally {
    await browser.close();
}
