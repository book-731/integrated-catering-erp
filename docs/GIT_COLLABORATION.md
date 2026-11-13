# 六人 GitHub 分支協作指南

目前策略：組長先完成整合驗收，再讓五位組員在同一程式、Schema與API基準上優化。不是六份獨立ERP，也不等待別人補API。本輪未自動commit、設定遠端或push。

| 人員         | 建議分支                 | 範圍                                 |
| ------------ | ------------------------ | ------------------------------------ |
| 主導者／組長 | main、integration        | 維護契約、審查、逐一合併與最終展示   |
| 組員2        | improve/menu-ui          | 食材／菜單／套餐與配方易用性、無障礙 |
| 組員3        | improve/orders-inventory | 訂單／流水例外、併發與重送測試       |
| 組員4        | improve/purchasing       | 供應商與部分收貨操作、錯誤提示       |
| 組員5        | improve/staff            | 日期輸入、班表／出勤／請假邊界       |
| 組員6        | improve/reports-demo     | 報表與原始資料對照、Demo與文件       |

先由組長檢查git status、.gitignore及機密掃描。若尚無初始commit，先提交本輪安全原始碼建立main基準，再由組長自行設定GitHub remote及push；不要把尚未初始化的歷史當作已存在。不要提交.env、work、outputs、node_modules、DB資料、密碼或Token。package-lock、Schema、Migration與測試必須提交。

每人從最新main建立分支，例如：

```powershell
git switch main
git pull --ff-only
git switch -c improve/menu-ui
```

完成後先跑check、db、test:integration；涉及跨模組再跑test:acceptance。提交時先git diff檢查，逐檔stage並開PR；PR說明具體變更、角色影響、API／Migration及驗證。不要在main直接改程式，也不以刪除失敗測試換綠燈。

組長設定main需PR、至少一位審查及CI通過；先合入integration，一次一個PR，處理衝突後重跑完整驗收，最後合回main。CI設定已存在，但本輪未推遠端執行，不能宣稱遠端已綠燈。

Schema變更先與組長協調。只加新Migration，不改本輪四版SQL、不互相覆寫已用Migration編號；先讀SQL確認無DROP／清空，再對各人本機套用。各人使用自己的本機.env與資料庫；可重複的展示資料由demo:prepare建立，不能同步或上傳私人DB實體檔。

遇到衝突優先理解業務規則，不以整份檔案覆蓋他人修改。禁止force-push共用main／integration；私人分支需要rebase時與組長協調。期末展示前建立團隊自行決定的tag，保存驗收JSON、ZIP雜湊與Demo流程。
