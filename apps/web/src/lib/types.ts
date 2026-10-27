// Shapes returned by the Kidora API. Dates arrive as ISO strings.
import type { AttendanceStatus, Role } from '@kidora/shared';

export interface ClassroomRef {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Attendance {
  id: string;
  childId: string;
  date: string;
  status: Exclude<AttendanceStatus, 'NOT_ARRIVED'>;
  checkInAt: string | null;
  droppedOffBy: string | null;
  checkOutAt: string | null;
  pickedUpBy: string | null;
  absenceNote: string | null;
  note: string | null;
}

export interface Child {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: 'FEMALE' | 'MALE' | 'OTHER' | null;
  photoUrl: string | null;
  allergies: string | null;
  medicalNotes: string | null;
  dietaryNotes: string | null;
  notes: string | null;
  photoConsent: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  classroomId: string | null;
  classroom: ClassroomRef | null;
}

export interface ChildListItem extends Child {
  today: Attendance | null;
}

export interface PickupPerson {
  id: string;
  fullName: string;
  relationship: string;
  phone: string | null;
  notes: string | null;
}

export interface EmergencyContact {
  id: string;
  fullName: string;
  relationship: string;
  phone: string;
}

export interface ChildDetail extends Child {
  guardians: Array<{
    relationship: string;
    isPrimary: boolean;
    user: PersonRef & { email: string; phone: string | null };
  }>;
  pickupPeople: PickupPerson[];
  emergencyContacts: EmergencyContact[];
  attendance: Attendance[];
}

export interface Classroom extends ClassroomRef {
  ageGroup: string | null;
  capacity: number;
  ratio: number;
  staff: PersonRef[];
  childCount: number;
  presentCount: number;
}

export interface RosterEntry {
  child: Child & {
    pickupPeople: Array<Pick<PickupPerson, 'id' | 'fullName' | 'relationship'>>;
    guardians: Array<{ relationship: string; user: { firstName: string; lastName: string } }>;
    messages: Array<Pick<Message, 'id' | 'template' | 'time' | 'note' | 'createdAt'>>;
  };
  attendance: Attendance | null;
}

export interface StaffDashboard {
  kind: 'staff';
  date: string;
  closure: Closure;
  counts: Record<AttendanceStatus | 'total', number>;
  classrooms: Array<
    ClassroomRef & {
      capacity: number;
      ratio: number;
      present: number;
      enrolled: number;
      staffCount: number;
      staffNeeded: number;
      ratioOk: boolean;
    }
  >;
  allergiesPresent: Array<PersonRef & { allergies: string }>;
  birthdays: Array<PersonRef & { date: string; turning: number }>;
  recent: Array<Attendance & { child: PersonRef }>;
  familyNotices: FamilyNotice[];
}

export interface ParentDashboard {
  kind: 'parent';
  date: string;
  closure: Closure;
  children: Array<
    Child & {
      classroom: (ClassroomRef & { staff: Array<{ firstName: string; lastName: string }> }) | null;
      today: Attendance | null;
    }
  >;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  classrooms: Array<{ classroom: ClassroomRef }>;
  children: Array<{ relationship: string; child: PersonRef }>;
}

export interface Activity {
  id: string;
  childId: string;
  date: string;
  type: import('@kidora/shared').ActivityType;
  occurredAt: string;
  data: Record<string, string | null | undefined>;
  note: string | null;
  createdById: string | null;
  createdBy: { firstName: string; lastName: string } | null;
  acknowledgedAt: string | null;
  child?: PersonRef & { classroom: { color: string } | null };
}

export interface DailyReport {
  date: string;
  child: PersonRef & { birthDate: string; allergies: string | null; classroom: ClassroomRef | null };
  attendance: Attendance | null;
  activities: Activity[];
  summary: {
    napMinutes: number;
    meals: Array<{ meal: string; amount: string }>;
    toilets: number;
    mood: string | null;
    incidents: number;
    unacknowledgedIncidents: number;
  };
}

export type Closure = { reason: 'HOLIDAY'; name: string } | { reason: 'WEEKEND'; name: null } | null;

export interface Holiday {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface CalendarData {
  holidays: Holiday[];
  weekendsClosed: boolean;
  today: { date: string; closure: Closure };
}

export interface Message {
  id: string;
  childId: string;
  senderId: string | null;
  senderRole: import('@kidora/shared').Role;
  sender: (PersonRef & { role: import('@kidora/shared').Role }) | null;
  template: import('@kidora/shared').MessageTemplate;
  time: string | null;
  note: string | null;
  createdAt: string;
}

export interface Thread {
  child: PersonRef & { classroom: ClassroomRef | null };
  lastMessage: Message | null;
  unread: number;
}

export interface Conversation {
  child: PersonRef & {
    classroom: (ClassroomRef & { staff: Array<{ firstName: string; lastName: string }> }) | null;
    guardians: Array<{ relationship: string; user: { firstName: string; lastName: string } }>;
  };
  messages: Message[];
  seenUntil: string | null;
}

export interface MedicationPlan {
  id: string;
  childId: string;
  name: string;
  dose: string;
  times: string[];
  startDate: string;
  endDate: string;
  instructions: string | null;
  createdRole: import('@kidora/shared').Role;
}

export interface MedicationDose {
  planId: string;
  slot: string;
  status: 'GIVEN' | 'LATE' | 'DUE' | 'UPCOMING';
  name: string;
  dose: string;
  instructions: string | null;
  child: PersonRef & { classroom: { color: string; name: string } | null };
  givenAt: string | null;
  givenBy: { firstName: string; lastName: string } | null;
}

export interface FamilyNotice extends Pick<Message, 'id' | 'template' | 'time' | 'note' | 'createdAt'> {
  child: PersonRef & { classroom: { name: string; emoji: string } | null };
  sender: { firstName: string; lastName: string } | null;
}

export interface NotificationItem extends Activity {
  unread: boolean;
}
