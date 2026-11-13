const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const envelope = (data: unknown) => ({
  type: 'object',
  required: ['success', 'data', 'requestId'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    data,
    requestId: { type: 'string', format: 'uuid' },
  },
});
const response = (description: string, schema: unknown) => ({
  description,
  content: { 'application/json': { schema } },
});
const errors = {
  '401': response('UNAUTHENTICATED', ref('ApiError')),
  '403': response('FORBIDDEN／CSRF_INVALID／ORIGIN_NOT_ALLOWED', ref('ApiError')),
  '404': response('RESOURCE_NOT_FOUND／NOT_FOUND', ref('ApiError')),
  '409': response(
    'SKU_CONFLICT／CATEGORY_NAME_CONFLICT／UNIT_LOCKED／CATEGORY_INACTIVE／INGREDIENT_INACTIVE／MENU_ITEM_INACTIVE／RECIPE_DUPLICATE／RECIPE_VERSION_CONFLICT／RESOURCE_IN_USE',
    ref('ApiError'),
  ),
  '415': response('UNSUPPORTED_MEDIA_TYPE', ref('ApiError')),
  '422': response(
    'VALIDATION_ERROR／UNIT_MISMATCH；禁止庫存輸入、負值、超過精度或重複單位換算',
    ref('ApiError'),
  ),
  '500': response('INTERNAL_ERROR；交易失敗整筆 rollback', ref('ApiError')),
};
const security = [{ CookieAuth: [] }];
const writeHeaders = [
  { in: 'header', name: 'X-CSRF-Token', required: true, schema: { type: 'string' } },
  { in: 'header', name: 'Origin', required: true, schema: { type: 'string', format: 'uri' } },
];
const idParameter = {
  in: 'path',
  name: 'id',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const decimal = (scale: number, integerDigits: number) => ({
  type: 'string',
  pattern: `^(0|[1-9]\\d{0,${integerDigits - 1}})(\\.\\d{1,${scale}})?$`,
  description: `非負十進位字串，最多 ${integerDigits} 位整數／${scale} 位小數；拒絕 number、科學記號及隱式四捨五入。`,
});
const unit = {
  type: 'string',
  minLength: 1,
  maxLength: 20,
  description:
    '食材基礎單位，trim 後不含空白，例如 g、kg、ml、L、個；大小寫須完全相同，不自動換算。',
};
const named = { type: 'string', minLength: 1, maxLength: 100 };
const ingredientFields = {
  sku: {
    type: 'string',
    pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$',
    description: 'trim 並轉大寫；DB 忽略大小寫／前後空白去重',
  },
  name: named,
  unit,
  safetyStock: decimal(3, 11),
  isActive: { type: 'boolean', default: true },
};
const categoryFields = { name: named, isActive: { type: 'boolean', default: true } };
const menuFields = {
  name: named,
  categoryId: { type: 'string', format: 'uuid' },
  price: decimal(2, 10),
  imageUrl: {
    type: 'string',
    format: 'uri',
    nullable: true,
    maxLength: 2048,
    description: 'HTTP(S) URL，不可含帳密；伺服器不抓取圖片',
  },
  isActive: { type: 'boolean', default: true },
  isAvailable: { type: 'boolean', default: true },
};
const timestamps = {
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
};
const ingredient = {
  type: 'object',
  required: [
    'id',
    ...Object.keys(ingredientFields),
    'stockQuantity',
    'isLowStock',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    ...ingredientFields,
    stockQuantity: {
      type: 'string',
      readOnly: true,
      example: '0.000',
      description: '唯讀現有庫存；新食材為 0；本階段沒有期初／調整／扣庫 API',
    },
    isLowStock: { type: 'boolean', readOnly: true },
    ...timestamps,
  },
};
const category = {
  type: 'object',
  required: ['id', 'name', 'isActive', 'menuItemCount'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    ...categoryFields,
    menuItemCount: { type: 'integer', minimum: 0 },
  },
};
const menu = {
  type: 'object',
  required: [
    'id',
    ...Object.keys(menuFields),
    'recipeVersion',
    'recipeCount',
    'category',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    ...menuFields,
    recipeVersion: { type: 'integer', minimum: 0 },
    recipeCount: { type: 'integer', minimum: 0 },
    category: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: named,
        isActive: { type: 'boolean' },
      },
    },
    ...timestamps,
  },
};
const paginated = (item: string) =>
  envelope({
    type: 'object',
    required: ['items', 'total', 'page', 'pageSize'],
    properties: {
      items: { type: 'array', items: ref(item) },
      total: { type: 'integer' },
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
    },
  });
const input = (properties: unknown, required?: string[]) => ({
  type: 'object',
  additionalProperties: false,
  ...(required ? { required } : { minProperties: 1 }),
  properties,
});
export const catalogSchemas = {
  Ingredient: ingredient,
  MenuCategory: category,
  MenuItem: menu,
  IngredientCreate: input(ingredientFields, ['sku', 'name', 'unit']),
  IngredientUpdate: input(ingredientFields),
  CategoryCreate: input(categoryFields, ['name']),
  CategoryUpdate: input(categoryFields),
  MenuCreate: input(menuFields, ['name', 'categoryId', 'price']),
  MenuUpdate: input(menuFields),
  IngredientsResponse: paginated('Ingredient'),
  CategoriesResponse: paginated('MenuCategory'),
  MenuItemsResponse: paginated('MenuItem'),
  Recipe: {
    type: 'object',
    required: ['menuItemId', 'version', 'items'],
    properties: {
      menuItemId: { type: 'string', format: 'uuid' },
      version: { type: 'integer', minimum: 0 },
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['ingredientId', 'sku', 'name', 'quantity', 'unit', 'isActive'],
          properties: {
            ingredientId: { type: 'string', format: 'uuid' },
            sku: ingredientFields.sku,
            name: named,
            quantity: { type: 'string', example: '100.000' },
            unit,
            isActive: { type: 'boolean' },
          },
        },
      },
    },
  },
  RecipeReplace: input(
    {
      expectedVersion: {
        type: 'integer',
        minimum: 0,
        maximum: 2147483646,
        description: 'GET recipe 的 version；過期版本回 409，防止覆蓋其他人的修改',
      },
      items: {
        type: 'array',
        maxItems: 100,
        description: '完整新配方，可為空；相同 ingredientId 不可重複，停用食材僅可原樣保留或移除',
        items: input(
          {
            ingredientId: { type: 'string', format: 'uuid' },
            quantity: {
              ...decimal(3, 11),
              not: { pattern: '^0(\\.0{1,3})?$' },
              description: '必須大於 0',
            },
            unit,
          },
          ['ingredientId', 'quantity', 'unit'],
        ),
      },
    },
    ['expectedVersion', 'items'],
  ),
};
function resource(
  path: string,
  tag: string,
  schema: string,
  create: string,
  update: string,
  list: string,
  key: string,
  roles: string,
  extras: unknown[] = [],
): Record<string, unknown> {
  const params = [
    { in: 'query', name: 'q', schema: { type: 'string', maxLength: 100 } },
    { in: 'query', name: 'isActive', schema: { type: 'boolean' } },
    {
      in: 'query',
      name: 'page',
      schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
    },
    {
      in: 'query',
      name: 'pageSize',
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
    ...extras,
  ];
  const single = envelope({ type: 'object', required: [key], properties: { [key]: ref(schema) } });
  return {
    [path]: {
      get: {
        tags: [tag],
        summary: `${roles}：搜尋／篩選／分頁`,
        security,
        parameters: params,
        responses: {
          '200': response('清單；數量固定 3 位、價格固定 2 位十進位字串', ref(list)),
          ...errors,
        },
      },
      post: {
        tags: [tag],
        summary: 'ADMIN／MANAGER：新增',
        security,
        parameters: writeHeaders,
        requestBody: { required: true, content: { 'application/json': { schema: ref(create) } } },
        responses: { '201': response('已建立', single), ...errors },
      },
    },
    [`${path}/{id}`]: {
      get: {
        tags: [tag],
        summary: `${roles}：查詢單筆`,
        security,
        parameters: [idParameter],
        responses: { '200': response('資料', single), ...errors },
      },
      patch: {
        tags: [tag],
        summary: 'ADMIN／MANAGER：修改／停用／啟用；保留原始關聯',
        description:
          '未提供欄位保持不變；無硬刪除 API。食材有配方或非零庫存時不可改單位。分類停用不刪除餐點；新建／變更分類／重新啟用餐點需有效啟用分類。',
        security,
        parameters: [idParameter, ...writeHeaders],
        requestBody: { required: true, content: { 'application/json': { schema: ref(update) } } },
        responses: { '200': response('已更新', single), ...errors },
      },
    },
  };
}
export const catalogPaths = {
  ...resource(
    '/ingredients',
    'Ingredients',
    'Ingredient',
    'IngredientCreate',
    'IngredientUpdate',
    'IngredientsResponse',
    'ingredient',
    'ADMIN／MANAGER／KITCHEN（廚房唯讀）',
    [
      { in: 'query', name: 'unit', schema: unit },
      {
        in: 'query',
        name: 'lowStock',
        schema: { type: 'boolean' },
        description: 'true：現有庫存 <= 安全庫存；false：高於安全庫存',
      },
    ],
  ),
  ...resource(
    '/menu-categories',
    'Menu',
    'MenuCategory',
    'CategoryCreate',
    'CategoryUpdate',
    'CategoriesResponse',
    'category',
    '四種登入角色',
  ),
  ...resource(
    '/menu-items',
    'Menu',
    'MenuItem',
    'MenuCreate',
    'MenuUpdate',
    'MenuItemsResponse',
    'menuItem',
    '四種登入角色',
    [
      { in: 'query', name: 'categoryId', schema: { type: 'string', format: 'uuid' } },
      { in: 'query', name: 'isAvailable', schema: { type: 'boolean' } },
    ],
  ),
  '/menu-items/{id}/recipe': {
    get: {
      tags: ['Recipes'],
      summary: 'ADMIN／MANAGER／KITCHEN：完整配方（含停用食材）',
      security,
      parameters: [idParameter],
      responses: {
        '200': response(
          '配方；單位取自食材基礎單位',
          envelope({ type: 'object', properties: { recipe: ref('Recipe') } }),
        ),
        ...errors,
      },
    },
    put: {
      tags: ['Recipes'],
      summary: 'ADMIN／MANAGER：原子替換完整配方，新增／修改／移除列',
      description:
        '同一交易驗權、單位、食材狀態與版本，再刪舊列、插入新列並遞增版本。失敗整筆 rollback。停用餐點只讀，不修改庫存。',
      security,
      parameters: [idParameter, ...writeHeaders],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('RecipeReplace') } },
      },
      responses: {
        '200': response(
          '已儲存及新版本',
          envelope({ type: 'object', properties: { recipe: ref('Recipe') } }),
        ),
        ...errors,
      },
    },
  },
  '/menu-items/{id}/ingredient-availability': {
    get: {
      tags: ['Ingredients'],
      summary: 'ADMIN／MANAGER／KITCHEN：唯讀檢查食材是否足夠製作指定份數',
      description:
        'Repeatable Read 唯讀交易，以 Decimal 計算用量與差額。不預留、不扣庫、不建立訂單，不包含採購價格或供應商資訊。櫃檯無權。',
      security,
      parameters: [
        idParameter,
        {
          in: 'query',
          name: 'servings',
          schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
          description: '只接受整數字串，不接受科學記號',
        },
      ],
      responses: {
        '200': response(
          '查詢當下可製作狀態；不是庫存保留承諾',
          envelope({
            type: 'object',
            required: ['availability'],
            properties: {
              availability: {
                type: 'object',
                required: [
                  'menuItemId',
                  'recipeVersion',
                  'servings',
                  'canPrepare',
                  'blockers',
                  'items',
                  'checkedAt',
                  'reservation',
                ],
                properties: {
                  menuItemId: { type: 'string', format: 'uuid' },
                  recipeVersion: { type: 'integer' },
                  servings: { type: 'integer' },
                  canPrepare: { type: 'boolean' },
                  blockers: { type: 'array', items: { type: 'string' } },
                  checkedAt: { type: 'string', format: 'date-time' },
                  reservation: { type: 'boolean', enum: [false] },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: [
                        'ingredientId',
                        'sku',
                        'name',
                        'unit',
                        'quantityPerServing',
                        'requiredQuantity',
                        'stockQuantity',
                        'safetyStock',
                        'isLowStock',
                        'isActive',
                        'sufficient',
                        'shortageQuantity',
                      ],
                      properties: {
                        ingredientId: { type: 'string', format: 'uuid' },
                        sku: ingredientFields.sku,
                        name: named,
                        unit,
                        quantityPerServing: { type: 'string', example: '1.250' },
                        requiredQuantity: { type: 'string', example: '3.750' },
                        stockQuantity: { type: 'string', example: '2.500' },
                        safetyStock: { type: 'string', example: '1.000' },
                        shortageQuantity: { type: 'string', example: '1.250' },
                        isLowStock: { type: 'boolean' },
                        isActive: { type: 'boolean' },
                        sufficient: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          }),
        ),
        ...errors,
      },
    },
  },
};
