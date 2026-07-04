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
