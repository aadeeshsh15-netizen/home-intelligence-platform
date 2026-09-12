import { z } from 'zod';

export const UpdateHomeSchema = z.object({
  name: z
    .string({ required_error: 'Home name is required' })
    .trim()
    .min(1, 'Home name cannot be empty')
    .max(64, 'Home name must not exceed 64 characters'),
});

export type UpdateHomeInput = z.infer<typeof UpdateHomeSchema>;
