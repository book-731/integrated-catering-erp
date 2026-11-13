import {
  UsersRound,
  UtensilsCrossed,
  ClipboardList,
  Package,
  Truck,
  CalendarDays,
  ChartNoAxesCombined,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from './roles';
interface Module {
  slug: string;
  name: string;
  description: string;
  icon: LucideIcon;
  roles: readonly Role[];
  implemented: boolean;
  path: string;
  note?: string;
}
export const modules: readonly Module[] = [
  {
    slug: 'users',
    name: '使用者與權限',
    description: '帳號、角色與存取權限',
    icon: UsersRound,
    roles: ['ADMIN'],
    implemented: true,
    path: '/users',
  },
  {
    slug: 'menu',
    name: '菜單與商品',
    description: '餐點、分類與食材配方',
    icon: UtensilsCrossed,
    roles: ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'],
    implemented: true,
    path: '/menu-items',
  },
  {
    slug: 'orders',
    name: '訂單與銷售',
    description: '訂單流程、付款與銷售',
    icon: ClipboardList,
    roles: ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'],
    implemented: true,
    path: '/orders',
  },
  {
    slug: 'inventory',
    name: '庫存管理',
    description: '食材庫存與異動紀錄',
    icon: Package,
    roles: ['ADMIN', 'MANAGER', 'KITCHEN'],
    implemented: true,
    path: '/inventory',
  },
  {
    slug: 'purchasing',
    name: '採購與供應商',
    description: '供應商、採購與收貨',
    icon: Truck,
    roles: ['ADMIN', 'MANAGER'],
    implemented: true,
    path: '/purchasing',
  },
  {
    slug: 'staff',
    name: '員工與排班',
    description: '員工、班表與出勤',
    icon: CalendarDays,
    roles: ['ADMIN', 'MANAGER'],
    implemented: true,
    path: '/staff',
  },
  {
    slug: 'reports',
    name: '報表與營運分析',
    description: '銷售、耗用與營運指標',
    icon: ChartNoAxesCombined,
    roles: ['ADMIN', 'MANAGER'],
    implemented: true,
    path: '/reports',
  },
];
