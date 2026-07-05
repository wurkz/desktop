import { jsPDF } from "jspdf";
import { formatMoney } from "@zorviz/core";
import type { AppConfig } from "@zorviz/db";
import type { JobTicket } from "./orders-api";
import { fetchLogoDataUrl } from "./logo-api";

// Generate + download a PDF invoice from a ticket (D9: PDF export, no direct print).
export async function generateInvoicePdf(ticket: JobTicket, config: AppConfig | null) {
    const currency = config?.currency_symbol ?? "";
    const doc = new jsPDF();
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
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(config?.shop_name ?? "Invoice", headerX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y += 6;

    const headerLines: string[] = [];
    if (config?.address) headerLines.push(config.address);
    const contact = [config?.contact_phone, config?.contact_email].filter(Boolean).join("  ·  ");
    if (contact) headerLines.push(contact);
    if (config?.tax_registration_id) headerLines.push(`TIN: ${config.tax_registration_id}`);
    if (config?.custom_fields) {
        try {
            const cf = JSON.parse(config.custom_fields) as Record<string, string>;
            for (const [k, v] of Object.entries(cf)) headerLines.push(`${k}: ${v}`);
        } catch { /* ignore malformed custom fields */ }
    }
    headerLines.forEach((line) => { doc.text(line, headerX, y); y += 4.5; });

    // Invoice meta (right aligned)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("INVOICE", right, 18, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(ticket.receipt_number ?? "(unbilled)", right, 24, { align: "right" });
    doc.text(new Date(ticket.updated_at).toLocaleDateString(), right, 29, { align: "right" });

    y = Math.max(y, 40) + 4;

    // Bill to + asset
    doc.setFont("helvetica", "bold");
    doc.text("Bill To:", left, y);
    doc.setFont("helvetica", "normal");
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
    y += 9;

    // Line items table
    doc.setFont("helvetica", "bold");
    doc.text("Description", left, y);
    doc.text("Qty", 128, y, { align: "right" });
    doc.text("Price", 160, y, { align: "right" });
    doc.text("Total", right, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 2;
    doc.line(left, y, right, y);
    y += 5;

    (ticket.items ?? []).forEach((it) => {
        doc.text(it.description.slice(0, 60), left, y);
        doc.text(String(it.quantity), 128, y, { align: "right" });
        doc.text(formatMoney(it.unit_price, currency), 160, y, { align: "right" });
        doc.text(formatMoney(it.total, currency), right, y, { align: "right" });
        y += 6;
    });

    doc.line(left, y, right, y);
    y += 6;

    const totalRow = (label: string, val: string, bold = false) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.text(label, 150, y, { align: "right" });
        doc.text(val, right, y, { align: "right" });
        y += 6;
    };
    totalRow("Subtotal", formatMoney(ticket.subtotal, currency));
    if (ticket.discount > 0) totalRow("Discount", `-${formatMoney(ticket.discount, currency)}`);
    totalRow("Tax", formatMoney(ticket.tax, currency));
    totalRow("Total", formatMoney(ticket.total, currency), true);

    doc.save(`invoice-${ticket.receipt_number ?? ticket.id.slice(0, 8)}.pdf`);
}
