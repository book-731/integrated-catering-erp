# 下一階段：訂單與庫存扣除設計建議

**僅為待審查設計，本次沒有建立下列表或 API。** 先由團隊確認下單／製作／付款／取消政策，再建立新的 Prisma Migration；不得重設或重寫已套用 Migration。

## 建議資料表

| 表                      | 主要欄位與用途                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order                   | id、唯一單號、內用／外帶／外送、status、revision、createdBy、createdAt、completedAt、cancelledAt、小計／折扣／服務費／總額 Decimal                 |
| OrderItem               | orderId、menuItemId、餐點名稱／單價快照、quantity、lineTotal；不可用目前售價重新計算舊訂單                                                         |
| OrderItemRecipeSnapshot | orderItemId、ingredientId、SKU／名稱／基礎單位快照、每份用量 Decimal、訂購量及總需求量、sourceRecipeVersion；建立後不可因配方編輯而改寫            |
| PaymentRecord           | orderId、方式、金額、記錄人與時間；僅記錄，不串真實金流                                                                                            |
| StockMovement           | ingredientId、signed quantity、before／after、unit 快照、type（期初／進貨／領料／耗損／調整／銷售／補償）、操作者、原因、來源 Order／Receipt、時間 |
| IdempotencyRecord       | actor／scope／key 唯一、payload hash、結果／狀態，用於建立訂單及狀態命令重送去重                                                                   |

現有 MenuItem.recipeVersion 與 RecipeIngredient 支援取得來源配方。快照必須於訂單交易中讀取一致版本、保存名稱／單位／Decimal 字串或獨立 Decimal 欄位；不能只留食材 ID 然後依日後可變資料回推。食材沒有配方時可改基礎單位的政策，在有訂單／庫存流水後還需擴大鎖定條件。

## 建議 API

| 方法／端點                           | 用途與必要條件                                                             |
| ------------------------------------ | -------------------------------------------------------------------------- |
| POST /api/orders                     | 建立訂單及配方／價格快照，需 Idempotency-Key；後端計算金額                 |
| GET /api/orders、GET /api/orders/:id | 分頁與日期／狀態查詢，依角色限制資料                                       |
| POST /api/orders/:id/transitions     | expectedRevision、目標狀態、Idempotency-Key；以條件更新避免重複轉移        |
| POST /api/orders/:id/payments        | 付款方式記錄，金額由後端驗證，不接金流                                     |
| GET /api/stock-movements             | 查流水，依日期／食材／來源分頁，不能任意改寫                               |
| POST /api/inventory/opening-balances | 授權管理者逐食材設定一次期初，與庫存更新及流水同一交易，需唯一來源／冪等鍵 |
| POST /api/inventory/adjustments      | 授權、原因與明確差額，建立可追溯流水，禁止裸 PATCH stockQuantity           |

## 交易與待確認規則

1. 建議 PENDING → PREPARING 扣庫，但團隊需確認是否改為下單預留。沒有可用配方、停用食材／餐點／分類、暫停供應時的下單規則需明定。
2. 依快照彙總所有食材需求，以 Prisma.Decimal 運算；固定 ingredient ID 順序 row lock 或條件 UPDATE stock >= required。任一不足整筆 rollback。
3. 在同一交易更新訂單狀態／revision、扣庫、寫入 StockMovement 與冪等結果。以來源事件唯一約束防重複扣庫，並處理 deadlock／serialization 有限重試。
4. PENDING 取消通常不回庫；已製作取消是否耗損或允許授權補償須確認。不要直接反向加庫而沒有事件／原因，也不能因取消重送重複補償。
5. 台幣小數、折扣／服務費、四捨五入、付款與製作完成分離、營業日 Asia/Taipei 邊界需確認，報表排除取消單。
6. 補齊不足庫存、重送、平行狀態轉移、配方同時修改、停用競爭、取消補償與交易失敗測試。維持既有登入、RBAC、CSRF 及全部回歸測試。

此規劃不包含採購、排班、發票／POS、真實金流或總帳開發。
