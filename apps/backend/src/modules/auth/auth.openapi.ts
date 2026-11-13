import { sessionCookieName } from './auth.middleware.js';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const success = (data: unknown) => ({
  type: 'object',
  required: ['success', 'data', 'requestId'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    data,
    requestId: { type: 'string', format: 'uuid' },
  },
});
const json = (schema: unknown) => ({ 'application/json': { schema } });
const ok = (description: string, schema: unknown) => ({ description, content: json(schema) });
const errors = {
  '401': ok(
    'UNAUTHENTICATED／INVALID_CREDENTIALS：未登入、Session 失效或帳密錯誤',
    ref('ApiError'),
  ),
  '403': ok('FORBIDDEN／CSRF_INVALID／ORIGIN_NOT_ALLOWED：角色或安全驗證不足', ref('ApiError')),
  '409': ok('EMAIL_CONFLICT／SELF_ADMIN_CHANGE／LAST_ADMIN：使用者管理衝突', ref('ApiError')),
  '415': ok('UNSUPPORTED_MEDIA_TYPE：需要 application/json', ref('ApiError')),
  '422': ok('VALIDATION_ERROR：欄位不合法、不接受額外欄位', ref('ApiError')),
  '429': {
    ...ok('RATE_LIMITED：請等待後重試；限制存於 PostgreSQL', ref('ApiError')),
    headers: {
      'Retry-After': { schema: { type: 'integer', minimum: 1 }, description: '等待秒數' },
    },
  },
  '500': ok('INTERNAL_ERROR：未預期錯誤（不揭露內部資訊）', ref('ApiError')),
};
const writeHeaders = [
  {
    in: 'header',
    name: 'X-CSRF-Token',
    required: true,
    schema: { type: 'string' },
    description: 'GET /auth/session 取得的 CSRF token；登入成功後需換新 token',
  },
  {
    in: 'header',
    name: 'Origin',
    required: true,
    schema: { type: 'string', format: 'uri' },
    description: '必須與伺服器允許的完整 origin 相符；瀏覽器自動送出',
  },
];
const security = [{ CookieAuth: [] }];
const fields = {
  email: {
    type: 'string',
    format: 'email',
    maxLength: 254,
    description: '登入識別，轉為小寫；資料庫忽略大小寫去重',
  },
  displayName: { type: 'string', minLength: 1, maxLength: 100 },
  role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'] },
  isActive: { type: 'boolean' },
};
export const authSecuritySchemes = {
  CookieAuth: {
    type: 'apiKey',
    in: 'cookie',
    name: sessionCookieName,
    description:
      '不透明 Session Cookie；HttpOnly，SameSite=Lax，HTTPS 部署使用 Secure 與 __Host- 前綴。以登入取得，勿手動儲存 token。',
  },
};
export const authSchemas = {
  PublicUser: {
    type: 'object',
    required: ['id', ...Object.keys(fields), 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      ...fields,
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  SessionResponse: success({
    type: 'object',
    required: ['user', 'csrfToken', 'expiresAt'],
    properties: {
      user: { allOf: [ref('PublicUser')], nullable: true },
      csrfToken: { type: 'string', description: '只存前端記憶體，不是 Session bearer token' },
      expiresAt: {
        type: 'string',
        format: 'date-time',
        description: '絕對期限；預設另有 30 分鐘閒置期限',
      },
    },
  }),
  UserResponse: success({
    type: 'object',
    required: ['user'],
    properties: { user: ref('PublicUser') },
  }),
  UsersResponse: success({
    type: 'object',
    required: ['items', 'total', 'page', 'pageSize'],
    properties: {
      items: { type: 'array', items: ref('PublicUser') },
      total: { type: 'integer' },
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
    },
  }),
  LoginInput: {
    type: 'object',
    additionalProperties: false,
    required: ['email', 'password'],
    properties: {
      email: fields.email,
      password: { type: 'string', minLength: 1, maxLength: 128, writeOnly: true },
    },
  },
  CreateUserInput: {
    type: 'object',
    additionalProperties: false,
    required: ['email', 'displayName', 'role', 'password'],
    properties: {
      ...fields,
      password: { type: 'string', minLength: 12, maxLength: 128, writeOnly: true },
    },
  },
  UpdateUserInput: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      ...fields,
      password: {
        type: 'string',
        minLength: 12,
        maxLength: 128,
        writeOnly: true,
        description: '提供即變更密碼，未提供則保留',
      },
    },
  },
};
export const authPaths = {
  '/auth/session': {
    get: {
      tags: ['Auth'],
      operationId: 'getSession',
      summary: '取得目前登入狀態／匿名 Session 與 CSRF token',
      description:
        '未登入仍回傳 200，user 為 null；新建 Session 時設定 HttpOnly Cookie。此端點禁止快取。新匿名 Session 每 IP 每分鐘最多 60 次。',
      responses: {
        '200': ok('目前 Session', ref('SessionResponse')),
        '403': errors['403'],
        '429': errors['429'],
        '500': errors['500'],
      },
    },
  },
  '/auth/login': {
    post: {
      tags: ['Auth'],
      operationId: 'login',
      summary: '以 Email 與密碼登入並輪替 Session',
      security,
      parameters: writeHeaders,
      requestBody: { required: true, content: json(ref('LoginInput')) },
      description:
        '先 GET /auth/session；錯誤密碼、未知／停用帳號使用相同 401。預設每 IP 30 次、每帳號 10 次／15 分鐘，成功嘗試亦計數。',
      responses: { '200': ok('新登入 Session 與新 CSRF token', ref('SessionResponse')), ...errors },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Auth'],
      operationId: 'logout',
      summary: '撤銷目前 Session 並清除 Cookie',
      security,
      parameters: writeHeaders,
      requestBody: {
        required: true,
        content: json({ type: 'object', additionalProperties: false }),
      },
      responses: {
        '200': ok(
          '已登出',
          success({
            type: 'object',
            properties: { user: { type: 'object', nullable: true, enum: [null] } },
          }),
        ),
        '403': errors['403'],
        '415': errors['415'],
        '500': errors['500'],
      },
    },
  },
  '/auth/me': {
    get: {
      tags: ['Auth'],
      operationId: 'getCurrentUser',
      summary: '取得目前登入者（未登入為 401）',
      security,
      responses: {
        '200': ok('登入者', ref('UserResponse')),
        '401': errors['401'],
        '500': errors['500'],
      },
    },
  },
  '/users': {
    get: {
      tags: ['Users'],
      operationId: 'listUsers',
      summary: 'ADMIN：使用者清單、搜尋與篩選',
      security,
      parameters: [
        { in: 'query', name: 'q', schema: { type: 'string', maxLength: 100 } },
        { in: 'query', name: 'role', schema: fields.role },
        { in: 'query', name: 'isActive', schema: { type: 'boolean' } },
        {
          in: 'query',
          name: 'page',
          schema: { type: 'integer', default: 1, minimum: 1, maximum: 100000 },
        },
        {
          in: 'query',
          name: 'pageSize',
          schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
        },
      ],
      responses: {
        '200': ok('分頁清單', ref('UsersResponse')),
        '401': errors['401'],
        '403': errors['403'],
        '422': errors['422'],
        '500': errors['500'],
      },
    },
    post: {
      tags: ['Users'],
      operationId: 'createUser',
      summary: 'ADMIN：新增使用者',
      security,
      parameters: writeHeaders,
      requestBody: { required: true, content: json(ref('CreateUserInput')) },
      responses: { '201': ok('建立完成（不回傳密碼或雜湊）', ref('UserResponse')), ...errors },
    },
  },
  '/users/{id}': {
    patch: {
      tags: ['Users'],
      operationId: 'updateUser',
      summary: 'ADMIN：修改／停用／啟用使用者',
      description:
        'Email、角色、密碼或啟用狀態改變時，同一交易遞增 authVersion 並刪除所有該使用者 Session。不得停用／降權自己，必須保留至少一位啟用管理員。',
      security,
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ...writeHeaders,
      ],
      requestBody: { required: true, content: json(ref('UpdateUserInput')) },
      responses: {
        '200': ok('更新完成', ref('UserResponse')),
        '404': ok('USER_NOT_FOUND', ref('ApiError')),
        ...errors,
      },
    },
  },
};
