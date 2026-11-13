# v0.4.0 業務 REST API

保留 /api/auth、/api/users、/api/ingredients、/api/menu-categories、/api/menu-items。新增前綴 **/api/operations**，真實規格可從 /api/openapi.json、/api/docs/ 讀取；Request schema 由與後端相同的 Zod schema 產生。

所有 API 回應維持 `{success:true,data,requestId}`；錯誤 `{success:false,error:{code,message},requestId}`。所有新成功命令 HTTP 200，管理寫入需 Cookie Session、完整允許的 Origin、X-CSRF-Token、application/json，body 必帶 UUID `requestKey`。重送同內容回傳原結果；同 key 不同 scope／內容 409 IDEMPOTENCY_CONFLICT。

清單預設 page=1、pageSize=20（最多100）、q 搜尋；回傳 `{items,total,page,pageSize}`。訂單、採購、流水可用 from／to（YYYY-MM-DD，台北包含結束當日）；訂單與採購可用 status。報表from/to最多366日，預設當月1日至今日；categoryId只篩銷售。UUID錯誤、額外寫入欄位、JSON number 金額／數量回422。

## 套餐與選項

| 方法      | 路徑                               | 輸入／用途                                                                |
| --------- | ---------------------------------- | ------------------------------------------------------------------------- |
| GET       | /menu/:id/configuration            | 四角色可讀；bundleParts含child，optionGroups含options，非CASHIER含recipes |
| PUT       | /menu/:id/bundle                   | 管理者，parts:[{childId,quantity:正整數1–100}]；空陣列移除組件            |
| POST／PUT | /option-groups、/option-groups/:id | menuItemId,name,minSelect,maxSelect,isActive                              |
| POST／PUT | /menu-options、/menu-options/:id   | groupId,name,price,isActive,recipes:[{ingredientId,quantity,unit}]        |

群組／選項由 ADMIN／MANAGER 管理，不移轉父項，不硬刪除歷史；recipes 是完整原子替換。用量大於零，基礎單位完全相同。群組最少0／最多20，最少不能大於最多。

## 庫存

- GET /stock-movements：ADMIN／MANAGER／KITCHEN。每列 id,ingredientId,ingredient{name,sku},type,quantity,before,after,unit,reason,actorId,source,createdAt。
- POST /inventory：ADMIN／MANAGER。body `{requestKey,ingredientId,type,quantity,reason}`。
- type：OPENING／COUNT 填目標總量；IN／COMPENSATION 加庫，ISSUE／WASTE 扣庫。SALE／RECEIPT 只能由訂單／採購服務產生。沒有更新／刪除流水端點。

```json
{
  "requestKey": "12345678-1234-4234-8234-123456789012",
  "ingredientId": "22345678-1234-4234-8234-123456789012",
  "type": "OPENING",
  "quantity": "100.125",
  "reason": "期初盤點"
}
```

OPENING_EXISTS、INSUFFICIENT_STOCK、INGREDIENT_INACTIVE 回409；負數、超精度回422。

## 訂單

- GET /orders、/orders/:id：四角色可讀，CASHIER 不回配方。每單 id,type,reference,status,revision,subtotal,discount,serviceFee,total,paymentMethod,paidAt,completedAt,createdBy,createdAt,lines。
- POST /orders：ADMIN／MANAGER／CASHIER。

```json
{
  "requestKey": "12345678-1234-4234-8234-123456789012",
  "type": "DINE_IN",
  "reference": "桌12",
  "discount": "5.00",
  "serviceFee": "2.50",
  "lines": [
    { "menuItemId": "22345678-1234-4234-8234-123456789012", "quantity": 2, "optionIds": [] }
  ]
}
```

type：DINE_IN／TAKEAWAY／DELIVERY；reference必填1–200字；1–50列，每列1–1000份。OrderLine 含 name,quantity,unitPrice,total,snapshot。snapshot 含categoryId/categoryName,recipeVersion,basePrice,components,options,recipes；recipe quantity是整列總需求，perServingQuantity是來源配方每份用量，不能依日後菜單回算。

- POST /orders/:id/status：`{requestKey,expectedRevision,status}`；PENDING→PREPARING／CANCELLED、PREPARING→COMPLETED／CANCELLED。KITCHEN不可取消；完成需付款；已付款不可取消。狀態改變及付款都遞增revision。
- POST /orders/:id/payment：`{requestKey,method}`，管理者／櫃檯；method CASH／CARD_RECORD／TRANSFER_RECORD，全額記錄一次，不串金流。
- 409：REVISION_CONFLICT、INVALID_TRANSITION、INSUFFICIENT_STOCK、PAYMENT_REQUIRED、PAYMENT_CONFLICT、PAID_ORDER。422：INVALID_DISCOUNT／OPTION_SELECTION／INVALID_OPTION；餐點停供或食材停用409。

## 採購與供應商（管理者）

- GET／POST /suppliers、PUT /suppliers/:id：name,contact,isActive；GET分頁，name唯一。
- GET／POST /purchases：supplierId,note,lines:[{ingredientId,unit,quantity,unitCost}]；回傳id,status,createdBy,createdAt,supplier,lines,receipts。
- PurchaseLine：id,ingredientId,unit,quantity,received,unitCost；同單不得重複食材。
- POST /purchases/:id/status：status APPROVED／ORDERED／CANCELLED，另帶requestKey。
- POST /purchases/:id/receipts：`{requestKey,lines:[{lineId,quantity}]}`；至少一列，不能超過未收數量；回GoodsReceipt的id,purchaseId,lines,actorId,createdAt。任一失敗全回滾；不同key再次收貨仍須驗餘量。
- 409 OVER_RECEIPT／INVALID_TRANSITION／SUPPLIER_INACTIVE；422 UNIT_MISMATCH／INVALID_LINE。

## 人事（管理者）

每個寫入另帶requestKey；所有清單支援q姓名與分頁。GET /employees含job；GET /shifts、/attendance、/leaves含employee。

| 資源                         | 方法                   | 輸入欄位                             |
| ---------------------------- | ---------------------- | ------------------------------------ |
| /jobs、/jobs/:id             | GET清單、POST、PUT單筆 | name,isActive                        |
| /employees、/employees/:id   | GET清單、POST、PUT單筆 | code,name,contact,jobId,isActive     |
| /shifts、/shifts/:id         | GET清單、POST、PUT單筆 | employeeId,start,end,note,isActive   |
| /attendance、/attendance/:id | GET清單、POST、PUT單筆 | employeeId,start,end或null,note      |
| /leaves                      | GET、POST              | employeeId,start,end,reason          |
| /leaves/:id/status           | POST                   | status APPROVED／REJECTED／CANCELLED |

時間為有offset的ISO8601，DB儲存timestamptz，前端以本機時間輸入再轉ISO。結束晚於開始，區間不超31日。班次停用保留資料；請假已核准可取消，其餘結案不再編輯。409 SCHEDULE_CONFLICT／LEAVE_CONFLICT／ATTENDANCE_CONFLICT／EMPLOYEE_INACTIVE；錯誤區間422 INVALID_INTERVAL。

## 營運報表（管理者）

GET /reports?from=2026-11-01&to=2026-11-30&categoryId=可選UUID。

data：from,to,currency,revenue,orderCount,procurement,sales,hot,stock,suppliers,staff。

- sales：date,revenue,orders；hot：name,quantity,amount（折扣前）。
- stock：ingredientId,name,unit,type,_sum.quantity；依單位分開，不能相加g與個。
- suppliers：name,amount（實際收貨數×單價）。
- staff：name,shifts,scheduledHours,attendanceHours,leaveHours；跨邊界區間只算查詢期間，未下班不計時數。
- 沒資料回真實0及空陣列，不產生固定營收。分類分攤規則及限制見 OPERATIONS-DECISIONS。
