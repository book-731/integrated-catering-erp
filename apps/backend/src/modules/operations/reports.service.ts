import { prisma } from '../../lib/prisma.js';
import { fail, decimal } from './repository.js';
import type { Query } from './validation.js';
export function dateWindow(q: Query) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const from = q.from ?? `${today.slice(0, 7)}-01`,
    to = q.to ?? today;
  const start = new Date(`${from}T00:00:00+08:00`),
    end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000);
  if (start >= end || end.getTime() - start.getTime() > 366 * 86400000)
    fail('INVALID_DATE_RANGE', '日期範圍須為1–366日。', 422);
  return { start, end, from, to };
}
export async function reports(q: Query) {
  const { start, end, from, to } = dateWindow(q);
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const completed = await tx.order.findMany({
        where: { status: 'COMPLETED', completedAt: { gte: start, lt: end } },
        include: { lines: true },
      });
      const sales = new Map<
          string,
          { date: string; revenue: ReturnType<typeof decimal>; orders: number }
        >(),
        hot = new Map<
          string,
          { name: string; quantity: number; amount: ReturnType<typeof decimal> }
        >();
      let revenue = decimal(0),
        orderCount = 0;
      for (const order of completed) {
        const lines = q.categoryId
          ? order.lines.filter(
              (l) => (l.snapshot as { categoryId?: string }).categoryId === q.categoryId,
            )
          : order.lines;
        if (!lines.length) continue;
        const lineSubtotal = lines.reduce((sum, l) => sum.plus(l.total), decimal(0));
        const attributed = q.categoryId
          ? order.subtotal.isZero()
            ? decimal(0)
            : order.total.times(lineSubtotal).div(order.subtotal).toDecimalPlaces(2)
          : order.total;
        revenue = revenue.plus(attributed);
        orderCount++;
        const day = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Taipei',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(order.completedAt!);
        const s = sales.get(day) ?? { date: day, revenue: decimal(0), orders: 0 };
        s.revenue = s.revenue.plus(attributed);
        s.orders++;
        sales.set(day, s);
        for (const line of lines) {
          const old = hot.get(line.menuItemId) ?? {
            name: line.name,
            quantity: 0,
            amount: decimal(0),
          };
          old.quantity += line.quantity;
          old.amount = old.amount.plus(line.total);
          hot.set(line.menuItemId, old);
        }
      }
      const stock = await tx.stockMovement.groupBy({
        by: ['ingredientId', 'unit', 'type'],
        where: { createdAt: { gte: start, lt: end } },
        _sum: { quantity: true },
      });
      const ingredientNames = await tx.ingredient.findMany({
        where: { id: { in: stock.map((s) => s.ingredientId) } },
        select: { id: true, name: true, sku: true },
      });
      const receipts = await tx.goodsReceipt.findMany({
        where: { createdAt: { gte: start, lt: end } },
        include: { purchase: { include: { supplier: true, lines: true } } },
      });
      let procurement = decimal(0);
      const suppliers = new Map<string, { name: string; amount: ReturnType<typeof decimal> }>();
      for (const receipt of receipts) {
        const rows = receipt.lines as { lineId: string; quantity: string }[];
        for (const row of rows) {
          const line = receipt.purchase.lines.find((l) => l.id === row.lineId);
          if (line) {
            const cost = line.unitCost.times(row.quantity);
            procurement = procurement.plus(cost);
            const s = suppliers.get(receipt.purchase.supplierId) ?? {
              name: receipt.purchase.supplier.name,
              amount: decimal(0),
            };
            s.amount = s.amount.plus(cost);
            suppliers.set(receipt.purchase.supplierId, s);
          }
        }
      }
      const employees = await tx.employee.findMany({ select: { id: true, name: true } });
      const shifts = await tx.shift.findMany({
          where: { isActive: true, start: { lt: end }, end: { gt: start } },
        }),
        attendance = await tx.attendance.findMany({
          where: { start: { lt: end }, end: { gt: start } },
        }),
        leaves = await tx.leave.findMany({
          where: { status: 'APPROVED', start: { lt: end }, end: { gt: start } },
        });
      const hours = (a: Date, b: Date) =>
        decimal(
          Math.max(
            0,
            Math.min(b.getTime(), end.getTime()) - Math.max(a.getTime(), start.getTime()),
          ),
        ).div(3600000);
      return {
        from,
        to,
        currency: 'TWD',
        revenue: revenue.toFixed(2),
        orderCount,
        procurement: procurement.toFixed(2),
        sales: [...sales.values()]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((v) => ({ ...v, revenue: v.revenue.toFixed(2) })),
        hot: [...hot.values()]
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 20)
          .map((v) => ({ ...v, amount: v.amount.toFixed(2) })),
        stock: stock.map((s) => ({
          ...s,
          name: ingredientNames.find((i) => i.id === s.ingredientId)?.name ?? s.ingredientId,
        })),
        suppliers: [...suppliers.values()].map((v) => ({ ...v, amount: v.amount.toFixed(2) })),
        staff: employees.map((e) => ({
          name: e.name,
          shifts: shifts.filter((s) => s.employeeId === e.id).length,
          scheduledHours: shifts
            .filter((s) => s.employeeId === e.id)
            .reduce((sum, s) => sum.plus(hours(s.start, s.end)), decimal(0))
            .toFixed(2),
          attendanceHours: attendance
            .filter((s) => s.employeeId === e.id)
            .reduce((sum, s) => sum.plus(hours(s.start, s.end!)), decimal(0))
            .toFixed(2),
          leaveHours: leaves
            .filter((s) => s.employeeId === e.id)
            .reduce((sum, s) => sum.plus(hours(s.start, s.end)), decimal(0))
            .toFixed(2),
        })),
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 20000 },
  );
}
