import { jsPDF } from "jspdf";
import { formatMoney } from "@zorviz/core";
import type { AppConfig } from "@zorviz/db";
import type { JobTicket } from "./orders-api";
import { fetchLogoDataUrl } from "./logo-api";
import { registerPdfFont, PDF_FONT_FAMILY } from "./pdf-font";

// Generate + download a PDF invoice / job order from a ticket (D9: PDF export, no direct
// print). Modeled on a BIR-style manual job order (PH market): configurable title, shop
// identity (proprietor / VAT status / TIN), a UNIT column, a terms & conditions block, and
// Prepared-by / Conformed signature lines. Blank fields are never printed (no empty lines).
// Generates + downloads the PDF and returns the saved filename (for a "saved to Downloads" toast).
export async function generateInvoicePdf(
    ticket: JobTicket,
    config: AppConfig | null,
    opts?: { forApproval?: boolean }
): Promise<string> {
    const currency = config?.currency_symbol ?? "";
    const doc = new jsPDF();
    // Embed a Unicode font so non-Latin-1 currency symbols (e.g. ₱) render correctly;
    // jsPDF's built-in Helvetica would otherwise corrupt the whole amount string.
    registerPdfFont(doc);
    const left = 15;
    const right = 195;
    let y = 18;

    // Optional logo (top-left); shop text shifts right when present.
    let headerX = left;
    if (config?.logo_path) {
        const logo = await fetchLogoDataUrl();
        const mime = logo ? logo.slice(5, logo.indexOf(";")) : "";
        const fmt = mime === "image/jpeg" ? "JPEG" : mime === "image/png" ? "PNG" : null;
        if (logo && fmt) {
            try {
                const props = doc.getImageProperties(logo);
                const max = 22;
                const ratio = props.width / props.height;
                const w = ratio >= 1 ? max : max * ratio;
                const h = ratio >= 1 ? max / ratio : max;
                doc.addImage(logo, fmt, left, 12, w, h);
                headerX = left + max + 4;
            } catch { /* ignore bad image */ }
        }
    }

    // Shop header
    doc.setFont(PDF_FONT_FAMILY, "bold");
    doc.setFontSize(18);
    doc.text(config?.shop_name ?? "Invoice", headerX, y);
    doc.setFont(PDF_FONT_FAMILY, "normal");
    doc.setFontSize(9);
    y += 6;

    // Header lines — each pushed only when it has content (no blank lines).
    const headerLines: string[] = [];
    if (config?.proprietor) headerLines.push(config.proprietor);
    const vatLabel = config?.vat_status === "non_vat" ? "Non-VAT Reg." : config?.vat_status === "vat" ? "VAT Reg." : "";
    const tinLine = [vatLabel, config?.tax_registration_id ? `TIN: ${config.tax_registration_id}` : ""].filter(Boolean).join("  ·  ");
    if (tinLine) headerLines.push(tinLine);
    if (config?.business_style) headerLines.push(`Business Style: ${config.business_style}`);
    if (config?.address) headerLines.push(config.address);
    const contact = [config?.contact_phone, config?.contact_email].filter(Boolean).join("  ·  ");
    if (contact) headerLines.push(contact);
    if (config?.custom_fields) {
        try {
            const cf = JSON.parse(config.custom_fields) as Record<string, string>;
            for (const [k, v] of Object.entries(cf)) if (v) headerLines.push(`${k}: ${v}`);
        } catch { /* ignore malformed custom fields */ }
    }
    headerLines.forEach((line) => { doc.text(line, headerX, y); y += 4.5; });

    // Document meta (right aligned): title, receipt/job-order no., date, terms.
    const title = (config?.document_title || "Invoice").toUpperCase();
    doc.setFont(PDF_FONT_FAMILY, "bold");
    doc.setFontSize(14);
    doc.text(title, right, 18, { align: "right" });
    doc.setFont(PDF_FONT_FAMILY, "normal");
    doc.setFontSize(9);
    let my = 24;
    // Pre-approval copies are annotated so a signed estimate isn't mistaken for the billed doc.
    if (opts?.forApproval) {
        doc.setFont(PDF_FONT_FAMILY, "bold");
        doc.setFontSize(8);
        doc.text("FOR CUSTOMER APPROVAL", right, my, { align: "right" });
        doc.setFont(PDF_FONT_FAMILY, "normal");
        doc.setFontSize(9);
        my += 5;
    }
    doc.text(ticket.receipt_number ?? "(unbilled)", right, my, { align: "right" });
    my += 5;
    if (ticket.job_order_no) { doc.text(`Job Order No.: ${ticket.job_order_no}`, right, my, { align: "right" }); my += 5; }
    doc.text(new Date(ticket.updated_at).toLocaleDateString(), right, my, { align: "right" });
    my += 5;
    if (ticket.terms) { doc.text(`Terms: ${ticket.terms}`, right, my, { align: "right" }); my += 5; }

    y = Math.max(y, my) + 4;

    // Bill to + asset
    doc.setFont(PDF_FONT_FAMILY, "bold");
    doc.text("Bill To:", left, y);
    doc.setFont(PDF_FONT_FAMILY, "normal");
    y += 5;
    if (ticket.customer) {
        doc.text(ticket.customer.name, left, y);
        y += 4.5;
        if (ticket.customer.phone) { doc.text(ticket.customer.phone, left, y); y += 4.5; }
    } else {
        doc.text("Walk-in", left, y);
        y += 4.5;
    }
    const s = (ticket.asset?.specs ?? {}) as Record<string, string>;
    const assetLabel = s.plateNumber || s.serialNumber || s.imei || [s.make, s.model].filter(Boolean).join(" ") || "Asset";
    doc.text(`Asset: ${assetLabel}${ticket.asset?.type ? ` (${ticket.asset.type})` : ""}`, left, y);
    y += 4.5;
    if (ticket.senior_pwd_type) {
        const lbl = ticket.senior_pwd_type === "pwd" ? "PWD" : "Senior Citizen";
        const who = ticket.senior_pwd_name ? `${ticket.senior_pwd_name} · ` : "";
        doc.text(`OSCA/PWD ID No.: ${who}${ticket.senior_pwd_id ?? "—"}  (${lbl})`, left, y);
        y += 4.5;
    }
    y += 5;

    // Line items table (QTY · UNIT · DESCRIPTION · UNIT PRICE · AMOUNT)
    const qtyX = 108, unitX = 116, priceX = 165;
    doc.setFont(PDF_FONT_FAMILY, "bold");
    doc.text("Description", left, y);
    doc.text("Qty", qtyX, y, { align: "right" });
    doc.text("Unit", unitX, y);
    doc.text("Price", priceX, y, { align: "right" });
    doc.text("Amount", right, y, { align: "right" });
    doc.setFont(PDF_FONT_FAMILY, "normal");
    y += 2;
    doc.line(left, y, right, y);
    y += 5;

    (ticket.items ?? []).forEach((it) => {
        doc.text(it.description.slice(0, 46), left, y);
        doc.text(String(it.quantity), qtyX, y, { align: "right" });
        if (it.unit) doc.text(it.unit.slice(0, 6), unitX, y);
        doc.text(formatMoney(it.unit_price, currency), priceX, y, { align: "right" });
        doc.text(formatMoney(it.total, currency), right, y, { align: "right" });
        y += 6;
    });

    doc.line(left, y, right, y);
    y += 6;

    const totalRow = (label: string, val: string, bold = false) => {
        doc.setFont(PDF_FONT_FAMILY, bold ? "bold" : "normal");
        doc.text(label, 150, y, { align: "right" });
        doc.text(val, right, y, { align: "right" });
        y += 6;
    };
    // BACK-3-009: VAT-inclusive orders show a gross subtotal (matches the line prices) and label
    // the tax line "VAT included"; exclusive orders show net + tax added on top.
    const inclusive = config?.tax_inclusive === 1;
    const ratePct = config?.tax_rate != null ? Math.round(config.tax_rate * 100) : null;
    const rateSuffix = ratePct != null ? ` (${ratePct}%)` : "";
    const subtotalShown = inclusive && !ticket.senior_pwd_type ? ticket.subtotal + ticket.tax : ticket.subtotal;
    // VAT-registered shops label the line "VAT"; others "Tax" (BACK-3-008).
    const taxWord = config?.vat_status === "vat" ? "VAT" : "Tax";
    const taxLabel = ticket.senior_pwd_type
        ? `${taxWord} (VAT-exempt)`
        : inclusive
          ? `VAT included${rateSuffix}`
          : `${taxWord}${rateSuffix}`;
    totalRow("Subtotal", formatMoney(subtotalShown, currency));
    if (ticket.discount > 0) totalRow("Discount", `-${formatMoney(ticket.discount, currency)}`);
    if (ticket.senior_discount > 0) totalRow("Senior/PWD Disc. (20%)", `-${formatMoney(ticket.senior_discount, currency)}`);
    totalRow(taxLabel, formatMoney(ticket.tax, currency));
    totalRow("Total", formatMoney(ticket.total, currency), true);

    // Terms & Conditions block (only if configured).
    if (config?.terms_and_conditions) {
        y += 4;
        doc.setFont(PDF_FONT_FAMILY, "bold");
        doc.setFontSize(8);
        doc.text("TERMS & CONDITIONS:", left, y);
        doc.setFont(PDF_FONT_FAMILY, "normal");
        y += 4;
        const tcLines = doc.splitTextToSize(config.terms_and_conditions, right - left);
        doc.text(tcLines, left, y);
        y += tcLines.length * 3.8;
        doc.setFontSize(9);
    }

    // Prepared by / Conformed signature lines.
    y += 16;
    const sigW = 70;
    doc.line(left, y, left + sigW, y);
    doc.line(right - sigW, y, right, y);
    y += 4;
    doc.setFontSize(8);
    doc.text("Prepared by", left, y);
    doc.text("Conformed", right - sigW, y);

    // Filename: <doc-title>-<plate/serial/imei>-<receipt or id>.pdf. The asset token
    // (plate number preferred) makes downloaded job orders easy to find in the shop.
    const base = (config?.document_title || "invoice").toLowerCase().replace(/\s+/g, "-");
    const assetToken = String(s.plateNumber || s.serialNumber || s.imei || [s.make, s.model].filter(Boolean).join("-") || "")
        .trim()
        .replace(/[^\w-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
    const ref = ticket.receipt_number ?? ticket.id.slice(0, 8);
    const filename = `${[base, assetToken, ref].filter(Boolean).join("-")}.pdf`;
    doc.save(filename);
    return filename;
}
