// All amounts are INTEGER centavos (see ./money). Results are rounded to whole centavos.

/**
 * Calculate tax amount in centavos.
 * @param amount Subtotal in centavos
 * @param rate Tax rate as a fraction (e.g. 0.12). Region-agnostic — no default.
 */
export function calculateTax(amount: number, rate: number): number {
    return Math.round(amount * rate);
}

/**
 * Calculate order total in centavos.
 * @param subtotal Subtotal in centavos
 * @param tax Tax in centavos
 * @param discount Discount in centavos
 */
export function calculateOrderTotal(subtotal: number, tax: number, discount: number): number {
    return subtotal + tax - discount;
}
