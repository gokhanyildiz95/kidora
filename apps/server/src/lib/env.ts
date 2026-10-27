import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4610),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET en az 16 karakter olmalı'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
});

export const env = envSchema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
