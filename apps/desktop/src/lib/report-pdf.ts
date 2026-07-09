import { jsPDF } from "jspdf";
import { formatMoney } from "@zorviz/core";
import type { AppConfig } from "@zorviz/db";
import { registerPdfFont, PDF_FONT_FAMILY } from "./pdf-font";
import type { EodReport, SoaData, FinancialSummary, SeniorPwdRow, MechanicRow, ReceivableRow } from "./reports-api";
import type { JobTicket, PaymentRecord } from "./orders-api";
import type { Part, Payable } from "./inventory-api";

// BACK-3-018 Tier 1: shared report-PDF infrastructure + the four document generators.
// All documents follow D9: PDF download (the caller shows the saved-to-Downloads toast);
// A4 today, and the same data re-renders to thermal width when BACK-1-005 lands.

const LEFT = 15;
const RIGHT = 195;

class ReportPdf {
    doc: jsPDF;
    y = 18;

    constructor() {
        this.doc = new jsPDF();
        registerPdfFont(this.doc);
    }

    /** Shop identity + report title + period line. */
    header(config: AppConfig | null, title: string, period: string) {
        const d = this.doc;
        d.setFont(PDF_FONT_FAMILY, "bold");
        d.setFontSize(16);
        d.text(config?.shop_name ?? "Zorviz", LEFT, this.y);
        d.setFontSize(13);
        d.text(title.toUpperCase(), RIGHT, this.y, { align: "right" });
        this.y += 5.5;
        d.setFont(PDF_FONT_FAMILY, "normal");
        d.setFontSize(9);
        if (config?.address) {
            d.text(config.address, LEFT, this.y);
            this.y += 4.5;
        }
        d.setFontSize(9);
        d.text(period, RIGHT, this.y - (config?.address ? 4.5 : 0), { align: "right" });
        this.y += 4;
        d.line(LEFT, this.y, RIGHT, this.y);
        this.y += 6;
    }

    ensureRoom(needed = 8) {
        if (this.y + needed > 280) {
            this.doc.addPage();
            this.y = 18;
        }
    }

    sectionTitle(label: string) {
        this.ensureRoom(10);
        this.doc.setFont(PDF_FONT_FAMILY, "bold");
        this.doc.setFontSize(10);
        this.doc.text(label, LEFT, this.y);
        this.doc.setFont(PDF_FONT_FAMILY, "normal");
        this.y += 5;
    }

    /** Simple table: columns carry a fixed x + alignment; rows are pre-formatted strings. */
    table(columns: { label: string; x: number; align?: "left" | "right" }[], rows: string[][]) {
        const d = this.doc;
        this.ensureRoom(12);
        d.setFont(PDF_FONT_FAMILY, "bold");
        d.setFontSize(8.5);
        for (const c of columns) d.text(c.label, c.x, this.y, { align: c.align ?? "left" });
        d.setFont(PDF_FONT_FAMILY, "normal");
        this.y += 2;
        d.line(LEFT, this.y, RIGHT, this.y);
        this.y += 4.5;
        d.setFontSize(9);
        for (const row of rows) {
            this.ensureRoom(6);
            row.forEach((cell, i) => {
                const c = columns[i];
                d.text(cell, c.x, this.y, { align: c.align ?? "left" });
            });
            this.y += 5.5;
        }
        this.y += 1.5;
    }

    /** Right-aligned label/value line (totals area). */
    kv(label: string, value: string, bold = false) {
        this.ensureRoom(7);
        this.doc.setFont(PDF_FONT_FAMILY, bold ? "bold" : "normal");
        this.doc.setFontSize(bold ? 11 : 9.5);
        this.doc.text(label, 150, this.y, { align: "right" });
        this.doc.text(value, RIGHT, this.y, { align: "right" });
        this.doc.setFont(PDF_FONT_FAMILY, "normal");
        this.y += bold ? 7 : 6;
    }

    note(text: string) {
        this.ensureRoom(8);
        this.doc.setFontSize(8);
        this.doc.setTextColor(120);
        const lines = this.doc.splitTextToSize(text, RIGHT - LEFT);
        this.doc.text(lines, LEFT, this.y);
        this.doc.setTextColor(0);
        this.y += lines.length * 3.8 + 2;
    }

    footer(generatedBy: string | null) {
        this.ensureRoom(10);
        this.y += 4;
        this.doc.setFontSize(8);
        this.doc.setTextColor(120);
        this.doc.text(
            `Generated ${new Date().toLocaleString()}${generatedBy ? ` by ${generatedBy}` : ""}`,
            LEFT,
            this.y
        );
        this.doc.setTextColor(0);
    }

    save(filename: string): string {
        this.doc.save(filename);
        return filename;
    }
}

const fmtDT = (ms: number) =>
    new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtD = (ms: number) => new Date(ms).toLocaleDateString();
export const methodLabel = (m: string) => (m === "gcash" ? "GCash" : m === "card" ? "Card" : "Cash");

/** 1. End-of-Day (Z-reading) report for the last closed drawer session. */
export function eodReportPdf(data: EodReport, config: AppConfig | null, generatedBy: string | null): string {
    const cur = config?.currency_symbol ?? "";
    const s = data.session;
    const r = new ReportPdf();
    r.header(config, "End-of-Day Report", `${fmtDT(s.opened_at)} — ${fmtDT(s.closed_at ?? Date.now())}`);

    r.sectionTitle("Sales by payment method");
    if (data.payments_by_method.length) {
        r.table(
            [
                { label: "Method", x: LEFT },
                { label: "Count", x: 120, align: "right" },
                { label: "Amount", x: RIGHT, align: "right" },
            ],
            data.payments_by_method.map((m) => [methodLabel(m.method), `${m.n}×`, formatMoney(m.total, cur)])
        );
    } else {
        r.note("No payments this session.");
    }

    if (data.drawer_expenses.length) {
        r.sectionTitle("Cash out — expenses paid from the drawer");
        r.table(
            [
                { label: "Time", x: LEFT },
                { label: "Category", x: 45 },
                { label: "Note", x: 80 },
                { label: "Amount", x: RIGHT, align: "right" },
            ],
            data.drawer_expenses.map((e) => [
                fmtDT(e.created_at),
                e.category,
                (e.note ?? "").slice(0, 40),
                formatMoney(e.amount, cur),
            ])
        );
    }

    if (data.movements.length) {
        r.sectionTitle("Drawer movements");
        r.table(
            [
                { label: "Time", x: LEFT },
                { label: "Type", x: 45 },
                { label: "By", x: 90 },
                { label: "Amount", x: RIGHT, align: "right" },
            ],
            data.movements.map((m) => [
                fmtDT(m.created_at),
                m.type === "cash_in" ? "Cash in" : "Cash drop",
                m.author ?? "—",
                formatMoney(m.amount, cur),
            ])
        );
    }

    r.sectionTitle("Cash reconciliation");
    const cashSales = data.payments_by_method.find((m) => m.method === "cash")?.total ?? 0;
    const ins = data.movements.filter((m) => m.type === "cash_in").reduce((a, m) => a + m.amount, 0);
    const drops = data.movements.filter((m) => m.type === "cash_drop").reduce((a, m) => a + m.amount, 0);
    const exp = data.drawer_expenses.reduce((a, e) => a + e.amount, 0);
    r.kv("Opening float", formatMoney(s.opening_float, cur));
    r.kv("+ Cash sales", formatMoney(cashSales, cur));
    if (ins) r.kv("+ Cash in", formatMoney(ins, cur));
    if (exp) r.kv("- Drawer expenses", formatMoney(exp, cur));
    if (drops) r.kv("- Cash drops", formatMoney(drops, cur));
    r.kv("Expected cash", formatMoney(s.expected_cash ?? 0, cur));
    r.kv("Counted cash", formatMoney(s.counted_cash ?? 0, cur));
    const os = s.over_short ?? 0;
    r.kv(os === 0 ? "BALANCED" : os > 0 ? "OVER" : "SHORT", formatMoney(Math.abs(os), cur), true);
    r.kv("Jobs completed this session", String(data.jobs_done));
    r.footer(generatedBy);
    return r.save(`eod-report-${fmtD(s.closed_at ?? Date.now()).replace(/\//g, "-")}.pdf`);
}

/** 2. Acknowledgment receipt for one payment (esp. partials — shows the remaining balance). */
export function paymentReceiptPdf(
    ticket: JobTicket,
    payment: PaymentRecord,
    paymentIndex: number,
    config: AppConfig | null,
    generatedBy: string | null
): string {
    const cur = config?.currency_symbol ?? "";
    const r = new ReportPdf();
    r.header(config, "Acknowledgment Receipt", fmtDT(payment.created_at));

    // What this payment belongs to.
    const paidBefore = (ticket.payments ?? []).slice(0, paymentIndex).reduce((a, p) => a + p.amount, 0);
    const balanceAfter = Math.max(0, ticket.total - paidBefore - payment.amount);
    r.kv("Received from", ticket.customer?.name ?? "Walk-in");
    if (ticket.receipt_number) r.kv("Reference", ticket.receipt_number);
    if (ticket.job_order_no) r.kv("Job Order No.", ticket.job_order_no);
    r.kv("Job total", formatMoney(ticket.total, cur));
    if (paidBefore > 0) r.kv("Previously paid", formatMoney(paidBefore, cur));
    r.kv(`Amount received (${methodLabel(payment.method)})`, formatMoney(payment.amount, cur), true);
    if (payment.change_due > 0) r.kv("Tendered / change", `${formatMoney(payment.tendered, cur)} / ${formatMoney(payment.change_due, cur)}`);
    r.kv(balanceAfter > 0 ? "BALANCE REMAINING" : "FULLY PAID", balanceAfter > 0 ? formatMoney(balanceAfter, cur) : "—", true);
    if (payment.processed_by) r.kv("Received by", payment.processed_by);
    r.note("Acknowledgment of payment received. This is not an official receipt / BIR invoice.");
    r.footer(generatedBy);
    return r.save(`payment-receipt-${ticket.receipt_number ?? ticket.id.slice(0, 8)}-${paymentIndex + 1}.pdf`);
}

/** 3. Statement of Account — the customer's outstanding balances. */
export function soaPdf(data: SoaData, config: AppConfig | null, generatedBy: string | null): string {
    const cur = config?.currency_symbol ?? "";
    const r = new ReportPdf();
    r.header(config, "Statement of Account", `As of ${new Date().toLocaleDateString()}`);
    r.kv("Customer", data.customer.name);
    if (data.customer.phone) r.kv("Phone", data.customer.phone);
    r.y += 2;

    r.table(
        [
            { label: "Date", x: LEFT },
            { label: "Reference", x: 50 },
            { label: "Job total", x: 120, align: "right" },
            { label: "Paid", x: 155, align: "right" },
            { label: "Balance", x: RIGHT, align: "right" },
        ],
        data.items.map((i) => [
            fmtD(i.created_at),
            i.receipt_number ?? i.job_order_no ?? i.id.slice(0, 8),
            formatMoney(i.total, cur),
            formatMoney(i.paid, cur),
            formatMoney(i.balance, cur),
        ])
    );
    const totalDue = data.items.reduce((a, i) => a + i.balance, 0);
    r.kv("TOTAL BALANCE DUE", formatMoney(totalDue, cur), true);
    r.note("Please settle the outstanding balance at your earliest convenience. Thank you!");
    r.footer(generatedBy);
    return r.save(`soa-${data.customer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
}

/** 4. Reorder list — the supplier shopping list from the low-stock filter. */
export function reorderListPdf(items: Part[], config: AppConfig | null, generatedBy: string | null): string {
    const cur = config?.currency_symbol ?? "";
    const r = new ReportPdf();
    r.header(config, "Reorder List", `As of ${new Date().toLocaleDateString()}`);

    // Suggested quantity restocks to 2× the reorder point — a simple buffer heuristic.
    const rows = items.map((p) => {
        const suggested = Math.max(Math.ceil(p.reorder_point * 2 - p.stock_on_hand), 1);
        return { p, suggested, est: suggested * p.unit_cost };
    });
    r.table(
        [
            { label: "SKU", x: LEFT },
            { label: "Item", x: 45 },
            { label: "On hand", x: 110, align: "right" },
            { label: "Reorder pt", x: 132, align: "right" },
            { label: "Suggested", x: 155, align: "right" },
            { label: "Est. cost", x: RIGHT, align: "right" },
        ],
        rows.map(({ p, suggested, est }) => [
            p.sku,
            p.name.slice(0, 28),
            String(p.stock_on_hand),
            String(p.reorder_point),
            String(suggested),
            formatMoney(est, cur),
        ])
    );
    r.kv("Estimated total", formatMoney(rows.reduce((a, x) => a + x.est, 0), cur), true);
    r.note("Suggested quantity restocks each item to twice its reorder point. Estimated cost uses the last recorded unit cost.");
    r.footer(generatedBy);
    return r.save(`reorder-list-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ---- Tier 2 documents (BACK-3-018) ----

const fmtDur = (ms: number) => {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    return `${h}h ${mins % 60}m`;
};

/** 5. Profit & Loss summary for a period. */
export function pnlPdf(data: FinancialSummary, period: string, config: AppConfig | null, generatedBy: string | null): string {
    const cur = config?.currency_symbol ?? "";
    const r = new ReportPdf();
    r.header(config, "Profit & Loss Summary", period);

    r.sectionTitle("Income (collections)");
    if (data.payments_by_method.length) {
        r.table(
            [
                { label: "Method", x: LEFT },
                { label: "Count", x: 120, align: "right" },
                { label: "Amount", x: RIGHT, align: "right" },
            ],
            data.payments_by_method.map((m) => [methodLabel(m.method), `${m.n}x`, formatMoney(m.total, cur)])
        );
    } else {
        r.note("No collections in this period.");
    }
    r.kv("Revenue", formatMoney(data.revenue, cur), true);

    r.sectionTitle("Expenses");
    if (data.expenses_by_category.length) {
        r.table(
            [
                { label: "Category", x: LEFT },
                { label: "Amount", x: RIGHT, align: "right" },
            ],
            data.expenses_by_category.map((e) => [e.category, formatMoney(e.total, cur)])
        );
    } else {
        r.note("No expenses recorded in this period.");
    }
    r.kv("Total expenses", formatMoney(data.expenses_total, cur), true);

    r.sectionTitle("Result");
    r.kv("Revenue", formatMoney(data.revenue, cur));
    r.kv("- Parts cost of sales (pro-rata)", formatMoney(data.cogs, cur));
    r.kv("Gross margin", formatMoney(data.revenue - data.cogs, cur));
    r.kv("- Total expenses", formatMoney(data.expenses_total, cur));
    r.kv("NET (revenue - expenses)", formatMoney(data.revenue - data.expenses_total, cur), true);
    r.note("Cash-basis summary from collections and the expense log. A planning gauge, not the books of account.");
    r.footer(generatedBy);
    return r.save(`pnl-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/** 6. VAT summary for a period (pro-rata per payment; collection basis). */
export function vatSummaryPdf(data: FinancialSummary, period: string, config: AppConfig | null, generatedBy: string | null): string {
    const cur = config?.currency_symbol ?? "";
    const r = new ReportPdf();
    r.header(config, "VAT Summary", period);
    r.kv("Total collections", formatMoney(data.revenue, cur));
    r.kv("VAT-exempt collections (Senior/PWD)", formatMoney(data.exempt_collections, cur));
    r.kv("VATable collections", formatMoney(data.revenue - data.exempt_collections, cur));
    r.kv("Discounts given (pro-rata)", formatMoney(data.discounts_given, cur));
    r.kv("VAT COLLECTED - set aside for BIR", formatMoney(data.vat_collected, cur), true);
    r.note(
        "VAT is apportioned pro-rata per payment (payment share x the order's VAT), consistent with " +
        "collection-basis service VAT. This is a set-aside planning gauge - your accountant's books govern the actual return."
    );
    r.footer(generatedBy);
    return r.save(`vat-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/** 7. Senior/PWD discount record (BIR compliance). */
export function seniorPwdPdf(rows: SeniorPwdRow[], period: string, config: AppConfig | null, generatedBy: string | null): string {
    const cur = config?.currency_symbol ?? "";
    const r = new ReportPdf();
    r.header(config, "Senior Citizen / PWD Discount Record", period);
    if (rows.length) {
        r.table(
            [
                { label: "Date paid", x: LEFT },
                { label: "Ref", x: 40 },
                { label: "Name / ID No.", x: 65 },
                { label: "Net sale", x: 138, align: "right" },
                { label: "Discount", x: 165, align: "right" },
                { label: "Total", x: RIGHT, align: "right" },
            ],
            rows.map((s) => [
                fmtD(s.paid_at),
                s.receipt_number ?? s.id.slice(0, 6),
                `${(s.senior_pwd_name ?? "-").slice(0, 22)} / ${s.senior_pwd_id ?? "-"}`,
                formatMoney(s.subtotal, cur),
                formatMoney(s.senior_discount, cur),
                formatMoney(s.total, cur),
            ])
        );
        r.kv("Total discounts granted", formatMoney(rows.reduce((a, s) => a + s.senior_discount, 0), cur), true);
        r.kv("Total VAT-exempt sales", formatMoney(rows.reduce((a, s) => a + s.total, 0), cur));
    } else {
        r.note("No Senior/PWD-discounted sales collected in this period.");
    }
    r.note("Statutory 20% discount on the VAT-exclusive amount; sales are VAT-exempt (RA 9994 / RA 10754). Collection-basis listing.");
    r.footer(generatedBy);
    return r.save(`senior-pwd-record-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/** 8. Mechanic productivity for a period. */
export function mechanicsPdf(rows: MechanicRow[], period: string, config: AppConfig | null, generatedBy: string | null): string {
    const cur = config?.currency_symbol ?? "";
    const r = new ReportPdf();
    r.header(config, "Mechanic Productivity", period);
    if (rows.length) {
        r.table(
            [
                { label: "Mechanic", x: LEFT },
                { label: "Jobs done", x: 95, align: "right" },
                { label: "Avg time", x: 125, align: "right" },
                { label: "Total time", x: 158, align: "right" },
                { label: "Job value", x: RIGHT, align: "right" },
            ],
            rows.map((m) => [
                m.name ?? m.assigned_mechanic_id.slice(0, 8),
                String(m.jobs),
                fmtDur(m.avg_ms),
                fmtDur(m.total_ms),
                formatMoney(m.revenue, cur),
            ])
        );
    } else {
        r.note("No completed, assigned jobs with timing in this period.");
    }
    r.note("Wrench time = Start Job to Mark as Done. Job value = totals of jobs completed in the period (not collections).");
    r.footer(generatedBy);
    return r.save(`mechanic-productivity-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/** 9. Supplier payables (outstanding on-account receives). */
export function payablesPdf(items: Payable[], config: AppConfig | null, generatedBy: string | null): string {
    const cur = config?.currency_symbol ?? "";
    const r = new ReportPdf();
    r.header(config, "Supplier Payables", `As of ${new Date().toLocaleDateString()}`);
    if (items.length) {
        r.table(
            [
                { label: "Date", x: LEFT },
                { label: "Supplier", x: 40 },
                { label: "Item received", x: 78 },
                { label: "Qty", x: 158, align: "right" },
                { label: "Owed", x: RIGHT, align: "right" },
            ],
            items.map((p) => [
                fmtD(p.created_at),
                (p.supplier ?? "-").slice(0, 16),
                `${p.item_name} (${p.sku})`.slice(0, 28),
                String(p.delta),
                formatMoney(p.balance, cur),
            ])
        );
        r.kv("TOTAL OWED TO SUPPLIERS", formatMoney(items.reduce((a, p) => a + p.balance, 0), cur), true);
    } else {
        r.note("No outstanding on-account receives.");
    }
    r.note("Settle a payable by recording the paying parts expense (it links to the receive automatically).");
    r.footer(generatedBy);
    return r.save(`payables-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/** 10. Receivables — customers with outstanding balances (the collectibles list). */
export function receivablesPdf(rows: ReceivableRow[], config: AppConfig | null, generatedBy: string | null): string {
    const cur = config?.currency_symbol ?? "";
    const r = new ReportPdf();
    r.header(config, "Receivables", `As of ${new Date().toLocaleDateString()}`);
    if (rows.length) {
        r.table(
            [
                { label: "Customer", x: LEFT },
                { label: "Phone", x: 78 },
                { label: "Open jobs", x: 128, align: "right" },
                { label: "Oldest", x: 162, align: "right" },
                { label: "Balance", x: RIGHT, align: "right" },
            ],
            rows.map((c) => [
                c.name.slice(0, 28),
                c.phone ?? "-",
                String(c.jobs),
                fmtD(c.oldest_at),
                formatMoney(c.balance, cur),
            ])
        );
        r.kv("TOTAL OUTSTANDING", formatMoney(rows.reduce((a, c) => a + c.balance, 0), cur), true);
    } else {
        r.note("No outstanding customer balances. All done jobs are fully paid.");
    }
    r.note("Per-customer detail (jobs and amounts) is the Statement of Account. Collect on the job ticket's Billing card.");
    r.footer(generatedBy);
    return r.save(`receivables-${new Date().toISOString().slice(0, 10)}.pdf`);
}
