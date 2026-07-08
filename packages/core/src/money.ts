/**
 * Money is stored and computed as INTEGER minor units (centavos) everywhere.
 * These helpers convert to/from the major unit and format for display.
 * Never do arithmetic on major-unit floats — it drifts (0.1 + 0.2 !== 0.3).
 */

/** Convert a major-unit amount (e.g. 123.45) to integer centavos (12345). */
export function toCentavos(major: number): number {
    return Math.round(major * 100);
}

/** Convert integer centavos (12345) back to a major-unit number (123.45). */
export function fromCentavos(centavos: number): number {
    return centavos / 100;
}

/**
 * Format integer centavos for display, e.g. formatMoney(12345, '₱') => "₱123.45".
 * Groups thousands and always shows two minor digits.
 */
export function formatMoney(centavos: number, currencySymbol = ''): string {
    const rounded = Math.round(centavos);
    const sign = rounded < 0 ? '-' : '';
    const abs = Math.abs(rounded);
    const major = Math.floor(abs / 100);
    const minor = (abs % 100).toString().padStart(2, '0');
    const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}${currencySymbol}${grouped}.${minor}`;
}

export interface TotalsInput {
    /** Sum of line prices as entered (net when exclusive, gross when inclusive), centavos. */
    entered: number;
    /** Manual discount amount already resolved to centavos. */
    discount: number;
    /** Senior/PWD sale (VAT-exempt + 20% off net). */
    senior: boolean;
    /** Tax rate as a fraction, e.g. 0.12. */
    taxRate: number;
    /** True when entered prices already include VAT (BACK-3-009). */
    taxInclusive: boolean;
}

export interface Totals {
    net: number; // canonical VAT-exclusive subtotal (centavos)
    tax: number;
    seniorDiscount: number;
    total: number;
}

/**
 * Canonical order-total math (BACK-3-009). MUST mirror `compute_totals` in the Rust backend so
 * client previews match what the server stores. Inclusive mode back-computes net + embedded VAT so
 * net + tax reconciles exactly to the entered gross; exclusive mode adds VAT on top.
 */
export function computeTotals({ entered, discount, senior, taxRate, taxInclusive }: TotalsInput): Totals {
    const net = taxInclusive ? Math.round(entered / (1 + taxRate)) : entered;
    const tax = senior ? 0 : taxInclusive ? entered - net : Math.round(net * taxRate);
    const seniorDiscount = senior ? Math.round(net * 0.2) : 0;
    const total = net + tax - discount - seniorDiscount;
    return { net, tax, seniorDiscount, total };
}
