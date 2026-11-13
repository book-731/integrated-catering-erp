# v0.4.0 專案審查指引

本 ZIP 為 Windows 本機單店課程 ERP，沿用 v0.3.0，包含七大模組真實 PostgreSQL 操作。不是對外正式部署驗收。附件未取得，依使用者需求與 OPERATIONS-DECISIONS 的保守預設實作。

1. 讀 README、OPERATIONS-DECISIONS、ARCHITECTURE、API／OPERATIONS-API。
2. 對照 Schema、前4版 Migration 與 check-database。前三版不可修改；第4版17張表與12項新增CHECK。
3. 審查 operations/repository 的共同DB鎖、撤權重驗、hash＋持久化命令結果與 move平衡流水；orders service的快照／狀態與扣庫、purchasing的餘量及原子收貨、staff的時間邊界。
4. 確認 routes每個寫入由後端驗角色及CSRF；Cashier回應移除配方，Kitchen沒有庫存或採購寫入權。
5. 前端API集中管理；各頁位於pages/operations，套餐與客製化位於menu-configuration。未回覆成功不顯示成功，失敗不以固定資料代替。
6. 執行 npm ci、db:generate、db:deploy、check、db、test:integration。連線自行設定，ZIP只包含佔位符.env.example；不提供共用帳密或資料庫實體檔。
7. 最新測試紀錄在docs/verification/acceptance-final，full-erp為先前快照，舊phase1／2A／2B記錄是歷史。不要重複累計多次執行同一案例。
8. 按DEMO以自己建立的實際資料操作；五人後續優化策略見COLLABORATION。

ZIP排除.env、node_modules、.git、work、outputs、資料庫實體檔、編譯輸出及產生的Prisma Client。執行generate可重建client。根目錄MANIFEST列出每檔SHA-256；旁邊ZIP_VERIFICATION記錄重開CRC、雜湊及機密掃描。

已知界線：Docker／Linux與遠端CI未驗證；套餐固定組件，不支援巢狀、單位換算或負食材替換；訂單明細／已收貨採購不直接改寫；無退款、真實金流、薪資或會計。報表限366日，適合本機資料量，未進行負載測試。pg adapter目前會出現非阻斷的並行query棄用提示，未升級既有核心套件。
