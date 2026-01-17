/**
 * Calculate tax amount
 * @param amount Subtotal amount
 * @param rate Tax rate (default 0.12 for VAT)
 */
export function calculateTax(amount: number, rate: number = 0.12): number {
    return Number((amount * rate).toFixed(2));
}

/**
 * Calculate order total
 * @param subtotal Subtotal amount
 * @param tax Tax amount
 * @param discount Discount amount
 */
export function calculateOrderTotal(subtotal: number, tax: number, discount: number): number {
    return Number((subtotal + tax - discount).toFixed(2));
}
