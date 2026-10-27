import { z } from 'zod';

/**
 * Messaging is built on ready-made phrases instead of free chat, so it stays quick for
 * teachers and light on the server. Each phrase may ask for a time ("10:30 gibi") and can
 * carry a short optional note. OTHER is the escape hatch and requires the note.
 */
export const PARENT_TEMPLATES = [
  'LATE_TODAY',
  'EARLY_PICKUP',
  'NOT_COMING',
  'SOMEONE_ELSE_PICKUP',
  'NOT_FEELING_WELL',
  'MEDICINE_IN_BAG',
  'BAD_NIGHT',
  'CALL_ME',
  'THANKS',
  'OTHER',
] as const;

export const TEACHER_TEMPLATES = [
  'NEEDS_CLOTHES',
  'NEEDS_DIAPERS',
  'NEEDS_PICKUP',
  'GREAT_DAY',
  'ATE_WELL',
  'ITEM_LEFT',
  'BRING_ITEM',
  'CALL_ME',
  'NOTED',
  'OTHER',
] as const;

export const MESSAGE_TEMPLATES = [...new Set([...PARENT_TEMPLATES, ...TEACHER_TEMPLATES])] as const;
export type MessageTemplate = (typeof MESSAGE_TEMPLATES)[number];

/** Phrases that take an optional "around what time" field. */
export const TIMED_TEMPLATES: readonly MessageTemplate[] = ['LATE_TODAY', 'EARLY_PICKUP', 'NEEDS_PICKUP', 'CALL_ME'];

/** Phrases teachers should notice right away; shown highlighted. */
export const URGENT_TEMPLATES: readonly MessageTemplate[] = ['NEEDS_PICKUP', 'NOT_FEELING_WELL', 'SOMEONE_ELSE_PICKUP'];

export const MESSAGE_NOTE_MAX = 200;

export const sendMessageSchema = z
  .object({
    template: z.enum(MESSAGE_TEMPLATES as unknown as [MessageTemplate, ...MessageTemplate[]]),
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .nullable(),
    note: z.string().trim().max(MESSAGE_NOTE_MAX).optional().nullable(),
  })
  .refine((m) => m.template !== 'OTHER' || !!m.note, { path: ['note'], message: 'Mesaj boş olamaz' })
  .refine((m) => !m.time || TIMED_TEMPLATES.includes(m.template), { path: ['time'], message: 'Bu ifade saat almaz' });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
