import { z } from 'zod';
import { ROLES } from './roles';

const name = z.string().trim().min(1).max(80);
const optionalText = z.string().trim().max(2000).optional().nullable();
const phone = z.string().trim().max(30).optional().nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  firstName: name,
  lastName: name,
  phone,
  role: z.enum(ROLES),
  classroomIds: z.array(z.string()).optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
  .omit({ password: true })
  .partial()
  .extend({ password: z.string().min(8).max(128).optional(), isActive: z.boolean().optional() });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const classroomSchema = z.object({
  name,
  ageGroup: z.string().trim().max(40).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#FF8A65'),
  emoji: z.string().max(8).default('🐣'),
  capacity: z.number().int().min(1).max(200).default(16),
  /** Max children per staff member for ratio warnings. */
  ratio: z.number().int().min(1).max(50).default(8),
});
export type ClassroomInput = z.infer<typeof classroomSchema>;

export const childSchema = z.object({
  firstName: name,
  lastName: name,
  birthDate: isoDate,
  gender: z.enum(['FEMALE', 'MALE', 'OTHER']).optional().nullable(),
  classroomId: z.string().optional().nullable(),
  allergies: optionalText,
  medicalNotes: optionalText,
  dietaryNotes: optionalText,
  notes: optionalText,
  photoConsent: z.boolean().default(true),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export type ChildInput = z.infer<typeof childSchema>;

export const guardianLinkSchema = z.object({
  userId: z.string(),
  relationship: z.string().trim().min(1).max(40),
  isPrimary: z.boolean().default(false),
});
export type GuardianLinkInput = z.infer<typeof guardianLinkSchema>;

export const pickupPersonSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  relationship: z.string().trim().min(1).max(40),
  phone,
  notes: optionalText,
});
export type PickupPersonInput = z.infer<typeof pickupPersonSchema>;

export const emergencyContactSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  relationship: z.string().trim().min(1).max(40),
  phone: z.string().trim().min(3).max(30),
});
export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;

export const checkInSchema = z.object({
  childId: z.string(),
  /** Free text name of who dropped the child off, e.g. "Annesi". */
  droppedOffBy: z.string().trim().max(120).optional().nullable(),
  note: optionalText,
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export const checkOutSchema = z.object({
  childId: z.string(),
  pickedUpBy: z.string().trim().min(1).max(120),
  note: optionalText,
});
export type CheckOutInput = z.infer<typeof checkOutSchema>;

export const absenceSchema = z.object({
  childId: z.string(),
  date: isoDate,
  reason: z.string().trim().max(500).optional().nullable(),
});
export type AbsenceInput = z.infer<typeof absenceSchema>;

// --- Daily activities (günlük akış) ---

export const ACTIVITY_TYPES = ['MEAL', 'NAP', 'TOILET', 'MOOD', 'MEDICATION', 'INCIDENT', 'PLAY', 'NOTE'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const MEALS = ['BREAKFAST', 'LUNCH', 'SNACK', 'BOTTLE'] as const;
export const MEAL_AMOUNTS = ['ALL', 'MOST', 'SOME', 'NONE'] as const;
export const TOILET_KINDS = ['WET', 'BM', 'DRY', 'POTTY'] as const;
export const MOODS = ['HAPPY', 'CALM', 'TIRED', 'SAD', 'FUSSY'] as const;

const time = z.string().datetime({ offset: true });

export const activityDataSchemas = {
  MEAL: z.object({
    meal: z.enum(MEALS),
    amount: z.enum(MEAL_AMOUNTS),
    items: z.string().trim().max(200).optional().nullable(),
  }),
  NAP: z.object({ endedAt: time.optional().nullable() }),
  TOILET: z.object({ kind: z.enum(TOILET_KINDS) }),
  MOOD: z.object({ mood: z.enum(MOODS) }),
  MEDICATION: z.object({
    name: z.string().trim().min(1).max(120),
    dose: z.string().trim().min(1).max(60),
    /** Set when the dose was given from a medication plan reminder */
    planId: z.string().optional().nullable(),
    slot: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  }),
  INCIDENT: z.object({
    description: z.string().trim().min(1).max(2000),
    actionTaken: z.string().trim().min(1).max(2000),
    bodyPart: z.string().trim().max(60).optional().nullable(),
  }),
  PLAY: z.object({ title: z.string().trim().min(1).max(120) }),
  NOTE: z.object({}),
} satisfies Record<ActivityType, z.ZodType>;

export type ActivityData = { [K in ActivityType]: z.infer<(typeof activityDataSchemas)[K]> };

export const createActivitySchema = z
  .object({
    childIds: z.array(z.string()).min(1).max(60),
    type: z.enum(ACTIVITY_TYPES),
    occurredAt: time.optional(),
    data: z.record(z.string(), z.unknown()).default({}),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    const result = activityDataSchemas[value.type].safeParse(value.data);
    if (!result.success) {
      for (const issue of result.error.issues) ctx.addIssue({ ...issue, path: ['data', ...issue.path] } as never);
    }
    if (value.type === 'NOTE' && !value.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Not boş olamaz' });
    }
  });
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const endNapSchema = z.object({ endedAt: time.optional() });

// --- School calendar (tatil günleri) ---

export const holidaySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((h) => h.endDate >= h.startDate, { path: ['endDate'], message: 'Bitiş tarihi başlangıçtan önce olamaz' });
export type HolidayInput = z.infer<typeof holidaySchema>;

export const holidayBatchSchema = z.object({ holidays: z.array(holidaySchema).min(1).max(60) });

export const schoolSettingsSchema = z.object({ weekendsClosed: z.boolean() });

// --- Guardians created on the spot by staff ---

export const newGuardianSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  firstName: name,
  lastName: name,
  phone,
  relationship: z.string().trim().min(1).max(40),
  isPrimary: z.boolean().default(false),
});
export type NewGuardianInput = z.infer<typeof newGuardianSchema>;

// --- Medication plans (ilaç planı) ---

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

export const medicationPlanSchema = z
  .object({
    childId: z.string(),
    name: z.string().trim().min(1).max(120),
    dose: z.string().trim().min(1).max(60),
    times: z.array(hhmm).min(1).max(6),
    startDate: isoDate,
    endDate: isoDate,
    instructions: z.string().trim().max(500).optional().nullable(),
  })
  .refine((p) => p.endDate >= p.startDate, { path: ['endDate'], message: 'Bitiş tarihi başlangıçtan önce olamaz' });
export type MedicationPlanInput = z.infer<typeof medicationPlanSchema>;

export const giveMedicationSchema = z.object({ slot: hhmm, note: z.string().trim().max(500).optional().nullable() });
