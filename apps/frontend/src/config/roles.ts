export const roles = ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = {
  ADMIN: '管理員',
  MANAGER: '店長',
  CASHIER: '櫃檯',
  KITCHEN: '廚房',
};
