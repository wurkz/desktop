import { z } from 'zod';

export const vehicleSpecsSchema = z.object({
    plateNumber: z.string().regex(/^[A-Z]{3}\s?\d{3,4}$/, "Invalid plate number format (e.g. ABC 1234)"),
    odometer: z.number().min(0).max(999999),
    make: z.string().min(1),
    model: z.string().min(1),
    year: z.number().min(1900).max(new Date().getFullYear() + 1).optional()
});
