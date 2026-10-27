export const ROLES = ['ADMIN', 'TEACHER', 'PARENT'] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: readonly Role[] = ['ADMIN', 'TEACHER'];

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}
