import { z } from 'zod';
export const id = z.uuid();
export const text = z.string().trim().min(1).max(100);
export const note = z.string().trim().max(500).default('');
export const amount = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/);
export const quantity = z.string().regex(/^(0|[1-9]\d{0,10})(\.\d{1,3})?$/);
export const positive = quantity.refine((v) => /[1-9]/.test(v), '數量須大於零');
export const command = { requestKey: z.uuid() };
export const recipeRow = z.strictObject({
  ingredientId: id,
  quantity: positive,
  unit: z.string().min(1).max(20),
});
export const interval = {
  employeeId: id,
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
};
export const listQuery = z.object({
  q: z.string().max(100).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  categoryId: id.optional(),
  status: z.string().max(30).optional(),
});
export const schemas = {
  bundle: z.strictObject({
    ...command,
    parts: z
      .array(z.strictObject({ childId: id, quantity: z.number().int().min(1).max(100) }))
      .max(30),
  }),
  group: z
    .strictObject({
      ...command,
      menuItemId: id,
      name: text,
      minSelect: z.number().int().min(0).max(20),
      maxSelect: z.number().int().min(1).max(20),
      isActive: z.boolean().default(true),
    })
    .refine((v) => v.minSelect <= v.maxSelect),
  option: z.strictObject({
    ...command,
    groupId: id,
    name: text,
    price: amount,
    isActive: z.boolean().default(true),
    recipes: z.array(recipeRow).max(50),
  }),
  stock: z.strictObject({
    ...command,
    ingredientId: id,
    type: z.enum(['OPENING', 'IN', 'ISSUE', 'WASTE', 'COUNT', 'COMPENSATION']),
    quantity,
    reason: z.string().trim().min(1).max(500),
  }),
  order: z.strictObject({
    ...command,
    type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']),
    reference: z.string().trim().min(1).max(200),
    discount: amount,
    serviceFee: amount,
    lines: z
      .array(
        z.strictObject({
          menuItemId: id,
          quantity: z.number().int().min(1).max(1000),
          optionIds: z.array(id).max(30),
        }),
      )
      .min(1)
      .max(50),
  }),
  transition: z.strictObject({
    ...command,
    expectedRevision: z.number().int().min(0),
    status: z.enum(['PREPARING', 'COMPLETED', 'CANCELLED']),
  }),
  payment: z.strictObject({
    ...command,
    method: z.enum(['CASH', 'CARD_RECORD', 'TRANSFER_RECORD']),
  }),
  supplier: z.strictObject({
    ...command,
    name: text,
    contact: z.string().trim().max(200),
    isActive: z.boolean().default(true),
  }),
  purchase: z.strictObject({
    ...command,
    supplierId: id,
    note,
    lines: z
      .array(
        z.strictObject({
          ingredientId: id,
          unit: z.string().min(1).max(20),
          quantity: positive,
          unitCost: amount,
        }),
      )
      .min(1)
      .max(100),
  }),
  purchaseStatus: z.strictObject({
    ...command,
    status: z.enum(['APPROVED', 'ORDERED', 'CANCELLED']),
  }),
  receipt: z.strictObject({
    ...command,
    lines: z
      .array(z.strictObject({ lineId: id, quantity: positive }))
      .min(1)
      .max(100),
  }),
  job: z.strictObject({ ...command, name: text, isActive: z.boolean().default(true) }),
  employee: z.strictObject({
    ...command,
    code: z.string().trim().min(1).max(64),
    name: text,
    contact: z.string().trim().max(200),
    jobId: id,
    isActive: z.boolean().default(true),
  }),
  shift: z.strictObject({ ...command, ...interval, note, isActive: z.boolean().default(true) }),
  attendance: z.strictObject({
    ...command,
    employeeId: id,
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }).nullable(),
    note,
  }),
  leave: z.strictObject({ ...command, ...interval, reason: z.string().trim().min(1).max(500) }),
  leaveStatus: z.strictObject({
    ...command,
    status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
  }),
};
export type Input<K extends keyof typeof schemas> = z.infer<(typeof schemas)[K]>;
export type Query = z.infer<typeof listQuery>;
