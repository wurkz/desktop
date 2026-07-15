import { chromium } from "playwright";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:3030/#/login");
  await page.getByLabel("Username").fill("admin");
  await page.locator("input").nth(1).click();
  await page.keyboard.type("123456");
  await page.waitForURL(/#\/$/);
  await page.waitForTimeout(400);

  // Seed 150 parts to exercise paging + server search
  const seeded = await page.evaluate(async () => {
    const auth = JSON.parse(localStorage.getItem("auth-storage") ?? "{}");
    const h = { Authorization: `Bearer ${auth?.state?.token}`, "Content-Type": "application/json" };
    const items = Array.from({ length: 150 }, (_, i) => ({
      name: `PGTEST Part ${String(i + 1).padStart(3, "0")}`,
      sku: `PGT-${String(i + 1).padStart(3, "0")}`,
      stock: 5, reorder_point: 1, unit_cost: 1000, unit_price: 2000,
    }));
    const r = await (await fetch("/api/inventory/import", { method: "POST", headers: h, body: JSON.stringify({ items }) })).json();
    return r;
  });
  console.log("seeded:", JSON.stringify(seeded));

  // Inventory page: first window 100, Load more appends, server search finds a deep item
  await page.goto("http://localhost:3030/#/inventory");
  await page.getByPlaceholder(/Search by SKU/i).waitFor();
  await page.waitForTimeout(700);
  let count1 = await page.getByLabel("Adjust stock").count();
  const loadMoreBtn = page.getByRole("button", { name: "Load more items" });
  console.log("first window rows:", count1, "| load-more visible:", await loadMoreBtn.count());
  await loadMoreBtn.click();
  await page.waitForTimeout(700);
  const count2 = await page.getByLabel("Adjust stock").count();
  console.log("after load more:", count2);
  // Server-side search: PGT-142 lives beyond the first window
  await page.getByPlaceholder(/Search by SKU/i).fill("PGT-142");
  await page.waitForTimeout(800);
  const found = await page.getByText("PGTEST Part 142").count();
  console.log("deep search finds PGT-142:", found > 0);

  // Expenses month filter
  await page.goto("http://localhost:3030/#/expenses");
  await page.locator("#exp-month").waitFor();
  const monthVal = await page.locator("#exp-month").inputValue();
  const rowsThisMonth = await page.getByText("Void").count().catch(() => 0);
  console.log("expenses month input:", monthVal);
  await page.locator("#exp-month").fill("2026-01");
  await page.waitForTimeout(700);
  const empty = await page.getByText("No expenses in this month").count();
  console.log("January empty state:", empty > 0);

  // Jobs page renders with the window
  await page.goto("http://localhost:3030/#/jobs");
  await page.getByText("Jobs", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "All" }).click();
  await page.waitForTimeout(500);
  const jobCards = await page.locator("main .space-y-3 > div, main > div").count();
  console.log("jobs page renders (cards>0):", jobCards > 0);

  // Customers page loads with window
  await page.goto("http://localhost:3030/#/customers");
  await page.getByPlaceholder(/Search by name/i).waitFor();
  await page.waitForTimeout(600);
  console.log("customers page ok; load-more (only if >100):", await page.getByRole("button", { name: "Load more customers" }).count());

  // Cleanup: delete the 150 seeded parts
  const cleaned = await page.evaluate(async () => {
    const auth = JSON.parse(localStorage.getItem("auth-storage") ?? "{}");
    const h = { Authorization: `Bearer ${auth?.state?.token}` };
    let deleted = 0;
    for (let off = 0; ; ) {
      const rows = await (await fetch(`/api/inventory/all?q=PGTEST&limit=200&offset=0`, { headers: h })).json();
      if (!rows.length) break;
      for (const r of rows) {
        const res = await fetch(`/api/inventory/${r.id}`, { method: "DELETE", headers: h });
        if (res.ok) deleted++;
      }
      if (rows.length < 200) break;
    }
    return deleted;
  });
  console.log("cleanup deleted:", cleaned);
} finally {
  await browser.close();
}
console.log("DONE");
