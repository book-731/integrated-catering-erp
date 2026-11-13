# v0.4.0 最終功能驗收清單

**2026-11-13更正範圍：** 午夜補驗發現adapter-pg非UTC連線時間偏移，先前畫面與API一致的驗證未涵蓋真實時間一致性。專用Demo已固定UTC並新增資料庫epoch／午夜界線檢查；原開發資料與舊展示資料不回填，原開發時間正確性仍待獨立修復。明天只使用TOMORROW_DEMO中的隔離環境；下列歷史驗收不可解讀為這項新風險已全面消除。

2026-11-13展示穩定性補驗：未新增ERP業務，修正Demo重複啟動與前端代理就緒檢查，補充明確隔離環境設定及`demo:stage`可重用資料。實際操作與復原見[TOMORROW_DEMO](TOMORROW_DEMO.md)，本輪命令證據在verification/tomorrow-demo；下列2026-11-12結果保留為歷史完整驗收，不代表已實際重開Windows。

日期：2026-11-12（Asia/Taipei）。以實際程式與本輪命令／API／瀏覽器證據為準，沒有提高版本號或新增ERP業務功能。Windows單店課程展示為本輪範圍。

| 模組         | 可操作前端                                                       | 真實API／PostgreSQL                                        | 業務邏輯、後端權限、錯誤及測試                                               | 判定         |
| ------------ | ---------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------ |
| 使用者與權限 | /login、/users                                                   | auth／users routes、User／Session／AuthRateLimit           | Argon2id、CSRF、限流、四角色、停用撤銷Session；auth、cookie、API與前端測試   | 通過本版範圍 |
| 菜單商品     | /ingredients、/menu-categories、/menu-items、/menu-configuration | catalog及operations/menu API、分類／餐點／配方／套餐／選項 | Decimal、唯一SKU／分類、單位、停用保留、套餐與快照；catalog及operations測試  | 通過本版範圍 |
| 訂單銷售     | /orders                                                          | orders／status／payment，Order／OrderLine／CommandReceipt  | 後端計價、不可變快照、冪等、狀態、付款後完成、取消政策；併發／不足／重送測試 | 通過本版範圍 |
| 庫存         | /inventory及食材頁                                               | inventory／stock-movements，StockMovement／Ingredient      | 期初一次、盤點、進出／耗損／補償、交易平衡、銷售扣庫；角色／rollback測試     | 通過本版範圍 |
| 採購供應商   | /purchasing                                                      | suppliers／purchases／receipts                             | 核准、訂購、部分收貨、超收拒絕、同交易入庫與去重；採購API及表單測試          | 通過本版範圍 |
| 員工排班     | /staff                                                           | jobs／employees／shifts／attendance／leaves                | 區間衝突、出勤／補登、請假核准；真實API、日期表單與瀏覽器保存測試            | 通過本版範圍 |
| 報表         | /reports                                                         | reports，直接讀取訂單、收貨、流水、人事                    | 台北日期、分類快照、Decimal、原始SQL核對、無假數據；API與前端測試            | 通過本版範圍 |

「通過本版範圍」不代表具備未列需求的商用完整ERP。明確界線見KNOWN_LIMITATIONS。

最終：Vitest169／169，HTTP營運／重啟22／22。各命令最終exit 0；已解決的失敗嘗試另外保留於RESULTS，不把未通過紀錄改稱成功。

## 證據

- docs/verification/acceptance-final/RESULTS.json：最終命令、退出碼與測試數；兩次test分開記錄，不重複累加。
- operational-flow.json、acceptance.json：21個HTTP營運檢查＋1個真正停止／重啟隔離API與PostgreSQL的持久性檢查。所有業務資料經HTTP API建立；直接SQL只作唯讀對照，不代替業務寫入。
- browser.json：七模組桌面、八頁390px手機，櫃檯建立／付款、廚房製作／完成、班表衝突與有效保存、直接越權拒絕、登出。不是只測HTTP首頁200。
- source-security.json：原始檔與SQL雜湊、四版Migration不變、env欄位差異及不含密碼的有效安全設定。

## 本輪修復

1. 不存在餐點的configuration原回500，改為正常404，加入PostgreSQL API回歸測試。
2. 原生datetime-local有值、React狀態尚未同步時，班表可送出null；改讀實際表單日期、轉ISO並保留失敗輸入。已先以回歸測試重現null，再修復並實際瀏覽器驗證。
3. 業務表格缺少users-table共用樣式、新增按鈕使用不存在的button-primary類別；沿用既有樣式修正，手機使用表格內部橫捲。
4. VALIDATION_ERROR提供欄位路徑，不輸出輸入值，避免所有錯誤只顯示金額／數量訊息。
5. 新增的隔離驗收啟停工具，修正Windows路徑分隔符的程序識別；停止前確認workspace、程序名稱、指令及PID，不碰開發服務。

正式簡報／ERD附件仍未提供。本輪完整ERD來自實際Schema與Migration，已由db檢查對照真實結構。

重啟核對23張營運／帳號／Migration表的完整列指紋，並用同一真實Session驗證重啟後仍能登入。sessions.lastSeenAt及限流活動可因瀏覽器重連改變，另行記錄，不要求活動紀錄完全不變；營運與帳號資料仍必須逐表相同。曾因把Session活動誤作資料遺失而失敗，已定位只有sessions變動並修正驗收判準，沒有清除資料。驗收JSON產生器也已採一致格式，重跑format:check通過。
