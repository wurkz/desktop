import { z } from 'zod';

export const contactInfoSchema = z.object({
    email: z.string().email("Invalid email address"),
    phone: z.string().min(10, "Phone number too short"),
    address: z.string().optional()
});

export const bookingSchema = z.object({
    scheduledTime: z.date().min(new Date(), "Booking time must be in the future"),
    assetId: z.string().uuid(),
    customerId: z.string().uuid()
});

export * from './validation/vehicle';
export * from './validation/gadget';
export * from './validation/appliance';
