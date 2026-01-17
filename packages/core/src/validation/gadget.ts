import { z } from 'zod';

export const gadgetSpecsSchema = z.object({
    serialNumber: z.string().min(1, "Serial number is required"),
    imei: z.string().regex(/^\d{15}$/, "IMEI must be 15 digits").optional(),
    brand: z.string().min(1),
    model: z.string().min(1),
    password: z.string().optional()
});
