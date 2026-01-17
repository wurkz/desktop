import { z } from 'zod';

export const applianceSpecsSchema = z.object({
    modelNumber: z.string().min(1),
    serialNumber: z.string().optional(),
    brand: z.string().min(1),
    type: z.string().min(1), // e.g. "Refrigerator"
    warrantyExpiresAt: z.date().optional()
});
