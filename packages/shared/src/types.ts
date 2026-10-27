import type { Role } from './roles';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  schoolId: string;
  schoolName: string;
  locale: string;
}

export type AttendanceStatus = 'PRESENT' | 'CHECKED_OUT' | 'ABSENT' | 'NOT_ARRIVED';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
