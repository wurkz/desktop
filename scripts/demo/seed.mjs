// BACK-1-007 — Demo seeder for Zorviz. Populates a FRESH (unconfigured) app with a
// realistic dataset for live demos, via the real HTTP API (same code paths as normal use).
// Assumes the app is running and NOT yet set up (run `demo:reset` to wipe first).
//
// Usage:  node scripts/demo/seed.mjs        (or: npm run demo:seed)
//         ZORVIZ_BASE=http://localhost:3030 by default.

const BASE = process.env.ZORVIZ_BASE || "http://localhost:3030";
const SHOP = "NP Car Aircon Repair";

// ---- tiny API client ------------------------------------------------------
let token = null;
async function api(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
}
const peso = (n) => Math.round(n * 100); // major → centavos
const log = (m) => console.log(`  ${m}`);

// PIN logins for the demo (documented in docs/demo-credentials.md).
const USERS = {
    admin: { name: "Owner (Noel P.)", username: "admin", pin: "123456" },
    advisor: { name: "Ana Reyes", username: "ana", role: "advisor", pin: "222222" },
    mechanic: { name: "Boy Santos", username: "boy", role: "mechanic", pin: "333333" },
};

async function waitForServer() {
    for (let i = 0; i < 180; i++) {
        try {
            const r = await fetch(`${BASE}/api/info`);
            if (r.ok) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`server not reachable at ${BASE}`);
}

export async function seedDemo() {
    console.log(`Seeding demo → ${BASE}`);
    await waitForServer();

    // Guard: only seed a fresh (unconfigured) app.
    const cfg = await api("GET", "/api/config");
    if (cfg) throw new Error("app already set up — run `npm run demo:reset` to start fresh, then re-seed.");

    // 1) Setup: shop + admin + a single Vehicle asset type (car-aircon shop).
    log("setup: shop + admin + asset type");
    const templates = await api("GET", "/api/asset-type-templates");
    const vehicle = templates.find((t) => t.key === "vehicle") ?? templates[0];
    await api("POST", "/api/setup", {
        shop_name: SHOP,
        currency_symbol: "₱",
        locale: "en-PH",
        tax_rate: 0.12,
        admin_name: USERS.admin.name,
        admin_username: USERS.admin.username,
        admin_pin: USERS.admin.pin,
        asset_types: [{ key: vehicle.key, name: vehicle.name, icon: vehicle.icon, fields: vehicle.fields, show_on_create: true }],
    });
    token = (await api("POST", "/api/login", { username: USERS.admin.username, pin: USERS.admin.pin })).token;

    // 2) Full shop profile (BIR-style job order fields).
    log("config: proprietor / VAT / TIN / terms / max discount");
    await api("PUT", "/api/config", {
        shop_name: SHOP,
        device_name: "Front Desk PC",
        currency_symbol: "₱",
        locale: "en-PH",
        tax_rate: 0.12,
        max_discount_pct: 0.15,
        address: "Quirino Ave, Davao City, Davao del Sur",
        contact_phone: "0917-555-0100",
        contact_email: "npcaraircon@example.com",
        tax_registration_id: "123-456-789-00000",
        vat_status: "vat",
        proprietor: "Noel P. — Sole Proprietor",
        business_style: SHOP,
        document_title: "Job Order",
        terms_and_conditions:
            "All accounts payable upon completion of the job. Unpaid balances bear 14% interest p.a. " +
            "Vehicles left over 30 days after completion may incur storage fees.",
        custom_fields: null,
    });

    // 3) Staff
    log("users: advisor + mechanic");
    await api("POST", "/api/users", USERS.advisor);
    const mech = await api("POST", "/api/users", USERS.mechanic);
    const mechId = mech.id ?? (await api("GET", "/api/users?role=mechanic")).find((u) => u.username === "boy")?.id;

    // 4) Customers
    log("customers");
    const cust = {};
    for (const [k, c] of Object.entries({
        juan: { name: "Juan Dela Cruz", phone: "0917-111-2222" },
        maria: { name: "Maria Santos", phone: "0918-333-4444" },
        pedro: { name: "Pedro Ramos", phone: "0919-555-6666" },
        lola: { name: "Lola Elena Cruz", phone: "0920-777-8888" }, // senior
        ramil: { name: "Ramil Tan", phone: "0921-999-0000" },
    })) {
        cust[k] = await api("POST", "/api/customers", c);
    }

    // 5) Assets (vehicles)
    log("assets");
    const asset = async (owner, specs) => api("POST", "/api/assets", { type: "vehicle", specs, owner_id: owner.id });
    const a = {
        juan: await asset(cust.juan, { plateNumber: "ABC-1234", make: "Toyota", model: "Vios", year: "2018", color: "Silver" }),
        maria: await asset(cust.maria, { plateNumber: "XYZ-5678", make: "Honda", model: "City", year: "2020", color: "White" }),
        pedro: await asset(cust.pedro, { plateNumber: "DEF-9012", make: "Mitsubishi", model: "Montero", year: "2019", color: "Black" }),
        lola: await asset(cust.lola, { plateNumber: "GHI-3456", make: "Suzuki", model: "Ertiga", year: "2021", color: "Red" }),
        ramil: await asset(cust.ramil, { plateNumber: "JKL-7788", make: "Ford", model: "Ranger", year: "2017", color: "Blue" }),
    };

    // 5b) Inventory — a small car-aircon parts catalog. Some estimate lines below link to
    // these, so approvals visibly deduct stock; the refrigerant starts below its reorder
    // point so the Low-stock filter and the dashboard low-stock stat have something to show.
    log("inventory (parts catalog)");
    const mkPart = (name, sku, stock, reorder, cost, price, description) =>
        api("POST", "/api/inventory", {
            name, sku, description,
            stock_on_hand: stock,
            reorder_point: reorder,
            unit_cost: peso(cost),
            unit_price: peso(price),
        });
    const inv = {
        compressor: await mkPart("A/C Compressor (reman)", "COMP-R134", 4, 2, 4800, 6500, "remanufactured, universal mount"),
        blower: await mkPart("Blower Motor", "BLOW-12V", 5, 2, 1900, 2800, "12V single-speed"),
        belt: await mkPart("Compressor Belt A33", "BELT-A33", 12, 4, 120, 260),
        refrigerant: await mkPart("R134a Refrigerant 500g", "R134-500", 2, 6, 180, 350, "500g can"),
        filter: await mkPart("Cabin Air Filter", "CABF-STD", 15, 5, 90, 210, "fits most sedans"),
        drier: await mkPart("Receiver Drier", "DRIER-U", 8, 3, 350, 620),
    };
    // One manual adjustment so the stock log has history (Receive +5 from a delivery).
    await api("POST", `/api/inventory/${inv.filter.id}/adjust`, { type: "receive", delta: 5, note: "Initial supplier delivery" });

    // helpers for the order pipeline
    const inspection = [
        { item: "Exterior / Body", status: "ok", note: "" },
        { item: "Battery / Power", status: "ok", note: "" },
        { item: "Lights / Display", status: "na", note: "" },
        { item: "Fluids / Leaks", status: "issue", note: "minor coolant seep" },
        { item: "Accessories", status: "ok", note: "" },
    ];
    const mkOrder = (assetId, complaint, jobNo, terms) =>
        api("POST", "/api/orders", { asset_id: assetId, customer_complaint: complaint, inspection, job_order_no: jobNo, terms });
    const estimate = (id, items, extra = {}) =>
        api("PUT", `/api/orders/${id}/estimate`, { items, discount: 0, ...extra });
    const completeAll = async (order) => {
        for (const it of order.items ?? []) await api("PUT", `/api/order_items/${it.id}/complete`, { completed: true });
    };
    const svc = (description, unit_price, quantity = 1, unit = "job") => ({ type: "service", description, quantity, unit, unit_price: peso(unit_price) });
    // Pass an inventory item to link the line (stock then deducts when the job is approved).
    const part = (description, unit_price, quantity = 1, unit = "pc", invItem = null) =>
        ({ type: "part", description, quantity, unit, unit_price: peso(unit_price), inventory_item_id: invItem?.id ?? null });

    // 6) Orders spanning every status so all views/stats are populated.
    log("orders across all statuses");

    // triage
    await mkOrder(a.juan.id, "Aircon not cold, weak airflow", "3301", "COD");

    // estimate (pending)
    const oEst = await mkOrder(a.maria.id, "Aircon compressor noisy", "3302", "COD");
    // Belt is inventory-linked but the estimate is NOT approved → no stock deduction (contrast case).
    await estimate(oEst.id, [svc("Freon recharge & leak test", 1200), part("Compressor Belt A33", 260, 1, "pc", inv.belt)]);

    // approved
    const oApp = await mkOrder(a.ramil.id, "No cooling; suspect low refrigerant", "3303", "COD");
    const oAppE = await estimate(oApp.id, [svc("Refrigerant recharge", 1500), svc("Leak repair", 800)]);
    await api("POST", `/api/orders/${oApp.id}/approve`, { approved_by: cust.ramil.name, method: "In person" });
    void oAppE;

    // in_progress (assigned, 1 of 2 items done)
    const oIp = await mkOrder(a.pedro.id, "Aircon compressor replacement", "3304", "50% down");
    const oIpE = await estimate(oIp.id, [part("A/C Compressor (reman)", 6500, 1, "set", inv.compressor), svc("Labor — R&R compressor", 2500)]);
    await api("POST", `/api/orders/${oIp.id}/approve`, { approved_by: cust.pedro.name, method: "Phone" });
    if (mechId) await api("POST", `/api/orders/${oIp.id}/assign`, { mechanic_id: mechId });
    if (oIpE.items?.[0]) await api("PUT", `/api/order_items/${oIpE.items[0].id}/complete`, { completed: true });

    // done (all items complete, not yet billed)
    const oDone = await mkOrder(a.juan.id, "Cabin filter + evaporator cleaning", "3305", "COD");
    const oDoneE = await estimate(oDone.id, [svc("Evaporator cleaning", 1800), part("Cabin Air Filter", 210, 1, "pc", inv.filter)]);
    await api("POST", `/api/orders/${oDone.id}/approve`, { approved_by: cust.juan.name, method: "In person" });
    if (mechId) await api("POST", `/api/orders/${oDone.id}/assign`, { mechanic_id: mechId });
    await completeAll(oDoneE);
    await api("POST", `/api/orders/${oDone.id}/done`);

    // paid (billed)
    const oPaid = await mkOrder(a.maria.id, "Blower motor replacement", "3306", "COD");
    const oPaidE = await estimate(oPaid.id, [part("Blower Motor", 2800, 1, "pc", inv.blower), svc("Labor", 900)]);
    await api("POST", `/api/orders/${oPaid.id}/approve`, { approved_by: cust.maria.name, method: "In person" });
    await completeAll(oPaidE);
    await api("POST", `/api/orders/${oPaid.id}/done`);
    await api("POST", `/api/orders/${oPaid.id}/bill`);

    // paid + SENIOR/PWD discount (VAT-exempt, 20% off)
    const oSenior = await mkOrder(a.lola.id, "Full aircon check-up & recharge", "3307", "COD");
    const oSeniorE = await estimate(oSenior.id, [svc("A/C check-up & recharge", 2000), svc("Condenser flush", 800)], {
        senior_pwd_type: "senior",
        senior_pwd_id: "OSCA-DVO-004521",
        senior_pwd_name: cust.lola.name,
    });
    await api("POST", `/api/orders/${oSenior.id}/approve`, { approved_by: cust.lola.name, method: "In person" });
    await completeAll(oSeniorE);
    await api("POST", `/api/orders/${oSenior.id}/done`);
    await api("POST", `/api/orders/${oSenior.id}/bill`);

    // 7) Bookings (call-aheads)
    log("bookings");
    const inHours = (h) => Date.now() + h * 3600 * 1000;
    await api("POST", "/api/bookings", { customer_name: "Ramon Bautista", customer_phone: "0917-222-3333", note: "Honda City — aircon leaking water inside cabin", scheduled_time: inHours(3) });
    const b2 = await api("POST", "/api/bookings", { customer_name: "Grace Lim", customer_phone: "0918-444-5555", note: "Isuzu D-Max — no cold air", scheduled_time: inHours(26) });
    await api("POST", `/api/bookings/${b2.id}/status`, { status: "confirmed" });

    console.log("\n✅ Demo seeded.");
    console.log(`   Shop: ${SHOP}`);
    console.log("   Logins (username / PIN):");
    console.log(`     admin  → ${USERS.admin.username} / ${USERS.admin.pin}`);
    console.log(`     advisor→ ${USERS.advisor.username} / ${USERS.advisor.pin}`);
    console.log(`     mechanic→ ${USERS.mechanic.username} / ${USERS.mechanic.pin}`);
}

// Run when invoked directly.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
    seedDemo().catch((e) => { console.error("\n❌ Seed failed:", e.message); process.exit(1); });
}
