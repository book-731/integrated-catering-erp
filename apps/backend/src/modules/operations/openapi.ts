import { z } from 'zod';
import { schemas } from './validation.js';
const money = { type: 'string', pattern: '^(0|[1-9][0-9]*)(\\.[0-9]{2})$', example: '197.50' };
const qty = { type: 'string', pattern: '^-?(0|[1-9][0-9]*)(\\.[0-9]{3})$', example: '2.125' };
const uuid = { type: 'string', format: 'uuid' },
  date = { type: 'string', format: 'date-time' };
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties });
const item = object({ id: uuid, name: { type: 'string' } });
export const operationsSchemas = {
  ...Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      `Ops_${name}`,
      z.toJSONSchema(schema, { target: 'openapi-3.0' }),
    ]),
  ),
  OpsMovement: object({
    id: uuid,
    ingredientId: uuid,
    ingredient: item,
    type: { type: 'string' },
    quantity: qty,
    before: qty,
    after: qty,
    unit: { type: 'string' },
    reason: { type: 'string' },
    source: { type: 'string' },
    actorId: uuid,
    createdAt: date,
  }),
  OpsOrder: object({
    id: uuid,
    type: { enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] },
    status: { enum: ['PENDING', 'PREPARING', 'COMPLETED', 'CANCELLED'] },
    revision: { type: 'integer' },
    reference: { type: 'string' },
    subtotal: money,
    discount: money,
    serviceFee: money,
    total: money,
    paymentMethod: { type: 'string', nullable: true },
    paidAt: { ...date, nullable: true },
    completedAt: { ...date, nullable: true },
    createdBy: uuid,
    createdAt: date,
    lines: {
      type: 'array',
      items: object({
        id: uuid,
        menuItemId: uuid,
        name: { type: 'string' },
        quantity: { type: 'integer' },
        unitPrice: money,
        total: money,
        snapshot: object({
          categoryId: uuid,
          categoryName: { type: 'string' },
          recipeVersion: { type: 'integer' },
          basePrice: money,
          components: { type: 'array', items: item },
          options: { type: 'array', items: item },
          recipes: {
            type: 'array',
            description: 'CASHIER 回應不含此欄位；不可變快照，quantity 為整列總需求。',
            items: object({
              ingredientId: uuid,
              name: { type: 'string' },
              sku: { type: 'string' },
              unit: { type: 'string' },
              perServingQuantity: qty,
              quantity: qty,
            }),
          },
        }),
      }),
    },
  }),
  OpsResult: object({
    success: { type: 'boolean', enum: [true] },
    requestId: uuid,
    data: {
      description: '單筆資源、分頁清單或報表；完整欄位見 docs/OPERATIONS-API.md',
      type: 'object',
      additionalProperties: true,
    },
  }),
};
export const operationsPaths: Record<string, Record<string, unknown>> = {};
function add(
  method: string,
  path: string,
  summary: string,
  roles: string,
  schema?: keyof typeof schemas,
) {
  operationsPaths['/operations' + path] ??= {};
  operationsPaths['/operations' + path]![method] = {
    tags: ['Operations'],
    summary,
    description: `權限：${roles}。寫入須 Cookie Session、Origin、X-CSRF-Token、JSON 與 requestKey UUID。同一操作者同 key 同內容回傳既有結果；不同內容 409。`,
    security: [{ CookieAuth: [] }],
    parameters: [
      ...(path.includes('{id}') ? [{ name: 'id', in: 'path', required: true, schema: uuid }] : []),
      ...(method === 'get' && !path.includes('{id}')
        ? ['q', 'page', 'pageSize', 'from', 'to', 'status', 'categoryId'].map((name) => ({
            name,
            in: 'query',
            schema: { type: ['page', 'pageSize'].includes(name) ? 'integer' : 'string' },
            description:
              'page預設1／pageSize預設20上限100；日期YYYY-MM-DD，報表最多366日；categoryId僅篩銷售。',
          }))
        : []),
    ],
    ...(schema
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: `#/components/schemas/Ops_${schema}` } },
            },
          },
        }
      : {}),
    responses: Object.fromEntries(
      ['200', '401', '403', '404', '409', '422', '500'].map((code) => [
        code,
        {
          description:
            code === '200'
              ? '成功；Decimal金額2位、數量3位字串'
              : {
                  '401': '未登入或已撤權',
                  '403': '角色／CSRF不符',
                  '404': '資源不存在',
                  '409': '重送內容衝突／庫存不足／狀態、班表或請假衝突',
                  '422': '格式、精度、單位或選項驗證失敗',
                  '500': '伺服器錯誤（不揭露SQL／憑證）',
                }[code],
          content: {
            'application/json': {
              schema: {
                $ref:
                  code === '200'
                    ? '#/components/schemas/OpsResult'
                    : '#/components/schemas/ApiError',
              },
            },
          },
        },
      ]),
    ),
  };
}
const manage = 'ADMIN／MANAGER',
  all = 'ADMIN／MANAGER／CASHIER／KITCHEN';
for (const [path, key, title] of [
  ['inventory', 'stock', '庫存命令'],
  ['orders', 'order', '建立訂單'],
  ['purchases', 'purchase', '建立採購申請'],
  ['option-groups', 'group', '建立選項群組'],
  ['menu-options', 'option', '建立選項'],
] as const)
  add('post', '/' + path, title, key === 'order' ? 'ADMIN／MANAGER／CASHIER' : manage, key);
for (const [path, key] of [
  ['suppliers', 'supplier'],
  ['jobs', 'job'],
  ['employees', 'employee'],
  ['shifts', 'shift'],
  ['attendance', 'attendance'],
] as const) {
  add('get', '/' + path, '分頁查詢' + path, manage);
  add('post', '/' + path, '新增' + path, manage, key);
  add('put', '/' + path + '/{id}', '修改／停用' + path, manage, key);
}
for (const [path, key] of [
  ['option-groups', 'group'],
  ['menu-options', 'option'],
] as const)
  add('put', '/' + path + '/{id}', '修改／停用' + path, manage, key);
add('get', '/menu/{id}/configuration', '查套餐、群組與選項', all);
add('put', '/menu/{id}/bundle', '原子替換固定套餐組件', manage, 'bundle');
add('get', '/stock-movements', '庫存異動流水', 'ADMIN／MANAGER／KITCHEN');
add('get', '/orders', '訂單清單', all);
add('get', '/orders/{id}', '訂單及快照', all);
add('post', '/orders/{id}/status', '轉移訂單狀態；KITCHEN不可取消', all, 'transition');
add('post', '/orders/{id}/payment', '全額付款方式紀錄', 'ADMIN／MANAGER／CASHIER', 'payment');
add('get', '/purchases', '採購、明細與收貨歷史', manage);
add('post', '/purchases/{id}/status', '核准、訂購或取消', manage, 'purchaseStatus');
add('post', '/purchases/{id}/receipts', '原子部分／完整收貨', manage, 'receipt');
add('get', '/leaves', '請假清單', manage);
add('post', '/leaves', '建立請假申請', manage, 'leave');
add('post', '/leaves/{id}/status', '核准、拒絕或取消請假', manage, 'leaveStatus');
add('get', '/reports', '真實營運報表；台北日期、分類', manage);
