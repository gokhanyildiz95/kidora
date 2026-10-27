import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';

/**
 * Which children a user may see:
 * admins see the whole school, teachers their assigned classrooms, parents their own children.
 */
export function childScope(user: AuthUser): Prisma.ChildWhereInput {
  switch (user.role) {
    case 'ADMIN':
      return { schoolId: user.schoolId };
    case 'TEACHER':
      return { schoolId: user.schoolId, classroom: { staff: { some: { userId: user.id } } } };
    case 'PARENT':
      return { schoolId: user.schoolId, guardians: { some: { userId: user.id } } };
  }
}

export function classroomScope(user: AuthUser): Prisma.ClassroomWhereInput {
  switch (user.role) {
    case 'ADMIN':
      return { schoolId: user.schoolId };
    case 'TEACHER':
      return { schoolId: user.schoolId, staff: { some: { userId: user.id } } };
    case 'PARENT':
      return { schoolId: user.schoolId, children: { some: { guardians: { some: { userId: user.id } } } } };
  }
}
