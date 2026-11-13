import type { Actor } from '../auth/auth.types.js';
import { write, management, requireItem, fail } from './repository.js';
import type { Input } from './validation.js';
export function job(actor: Actor, id: string | undefined, input: Input<'job'>) {
  return write(actor, management, `job:${id ?? 'new'}`, input, (tx) => {
    const { requestKey: _, ...data } = input;
    return id ? tx.job.update({ where: { id }, data }) : tx.job.create({ data });
  });
}
export function employee(actor: Actor, id: string | undefined, input: Input<'employee'>) {
  return write(actor, management, `employee:${id ?? 'new'}`, input, async (tx) => {
    const { requestKey: _, ...data } = input;
    const job = requireItem(await tx.job.findUnique({ where: { id: input.jobId } }));
    if (!job.isActive && input.isActive) fail('JOB_INACTIVE', '職務已停用。');
    return id ? tx.employee.update({ where: { id }, data }) : tx.employee.create({ data });
  });
}
export function timeRange(start: string, end: string) {
  if (new Date(start) >= new Date(end)) fail('INVALID_INTERVAL', '結束時間須晚於開始時間。', 422);
  if (new Date(end).getTime() - new Date(start).getTime() > 31 * 86400000)
    fail('INVALID_INTERVAL', '單筆區間不得超過31日。', 422);
  return { start: new Date(start), end: new Date(end) };
}
export function shift(actor: Actor, id: string | undefined, input: Input<'shift'>) {
  return write(actor, management, `shift:${id ?? 'new'}`, input, async (tx) => {
    const employee = requireItem(await tx.employee.findUnique({ where: { id: input.employeeId } }));
    const range = timeRange(input.start, input.end);
    if (!employee.isActive) fail('EMPLOYEE_INACTIVE', '員工已停用。');
    if (input.isActive) {
      if (
        await tx.shift.count({
          where: {
            employeeId: employee.id,
            isActive: true,
            ...(id ? { id: { not: id } } : {}),
            start: { lt: range.end },
            end: { gt: range.start },
          },
        })
      )
        fail('SCHEDULE_CONFLICT', '班表時間重疊。');
      if (
        await tx.leave.count({
          where: {
            employeeId: employee.id,
            status: 'APPROVED',
            start: { lt: range.end },
            end: { gt: range.start },
          },
        })
      )
        fail('LEAVE_CONFLICT', '與已核准請假衝突。');
    }
    const data = { employeeId: employee.id, ...range, note: input.note, isActive: input.isActive };
    return id ? tx.shift.update({ where: { id }, data }) : tx.shift.create({ data });
  });
}
export function attendance(actor: Actor, id: string | undefined, input: Input<'attendance'>) {
  return write(actor, management, `attendance:${id ?? 'new'}`, input, async (tx) => {
    const employee = requireItem(await tx.employee.findUnique({ where: { id: input.employeeId } }));
    if (!employee.isActive) fail('EMPLOYEE_INACTIVE', '員工已停用。');
    if (input.end) timeRange(input.start, input.end);
    const start = new Date(input.start),
      end = input.end ? new Date(input.end) : null;
    if (
      await tx.attendance.count({
        where: {
          employeeId: employee.id,
          ...(id ? { id: { not: id } } : {}),
          ...(end ? { start: { lt: end } } : {}),
          OR: [{ end: null }, { end: { gt: start } }],
        },
      })
    )
      fail('ATTENDANCE_CONFLICT', '出勤紀錄重疊或尚未下班。');
    const data = { employeeId: employee.id, start, end, note: input.note, actorId: actor.id };
    return id ? tx.attendance.update({ where: { id }, data }) : tx.attendance.create({ data });
  });
}
export function leave(actor: Actor, input: Input<'leave'>) {
  return write(actor, management, 'leave', input, async (tx) => {
    const employee = requireItem(await tx.employee.findUnique({ where: { id: input.employeeId } }));
    if (!employee.isActive) fail('EMPLOYEE_INACTIVE', '員工已停用。');
    const range = timeRange(input.start, input.end);
    if (
      await tx.leave.count({
        where: {
          employeeId: employee.id,
          status: { in: ['REQUESTED', 'APPROVED'] },
          start: { lt: range.end },
          end: { gt: range.start },
        },
      })
    )
      fail('LEAVE_CONFLICT', '請假重疊。');
    return tx.leave.create({
      data: { employeeId: employee.id, ...range, reason: input.reason, actorId: actor.id },
    });
  });
}
export function leaveStatus(actor: Actor, id: string, input: Input<'leaveStatus'>) {
  return write(actor, management, `leave:${id}:status`, input, async (tx) => {
    const l = requireItem(await tx.leave.findUnique({ where: { id } }));
    if (l.status !== 'REQUESTED' && !(l.status === 'APPROVED' && input.status === 'CANCELLED'))
      fail('INVALID_TRANSITION', '請假已結案。');
    if (
      input.status === 'APPROVED' &&
      (await tx.shift.count({
        where: {
          employeeId: l.employeeId,
          isActive: true,
          start: { lt: l.end },
          end: { gt: l.start },
        },
      }))
    )
      fail('SCHEDULE_CONFLICT', '請先取消衝突班次再核准請假。');
    return tx.leave.update({ where: { id }, data: { status: input.status } });
  });
}
