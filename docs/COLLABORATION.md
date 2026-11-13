# 組內協作策略

目前由主導者維護同一 npm workspace、Schema、API契約及整合測試。功能整合通過後，其他五位組員才各自優化，不等待六份獨立API／資料庫，也不複製六套專案。

建議五個後續修改面向：菜單與表單易用性；訂單／庫存併發與例外測試；採購／收貨體驗；員工／排班與日期邊界；報表／Demo與無障礙。各自從同一主線建立短期分支，資料模型變更先協調，新增Migration而不改已套用SQL。

小組整合時逐一合併，跑check、db與隔離整合測試，再一起走DEMO。測試只能清理自己建立且可辨識的測試資料。不可刪掉失敗測試來取得綠燈。API變更同步Request／Response／RBAC及文件。package-lock必須保留；.env、work資料庫、密碼及金鑰不進Git。

閱讀順序：README → OPERATIONS-DECISIONS → ARCHITECTURE → API／OPERATIONS-API → Schema與Migration → 對應service及測試。業務命令交易入口在operations/repository.ts；高流量細粒度鎖是後續優化，不能移除交易、冪等或操作者重驗。

本次沒有自動commit／push／建立遠端PR；組長檢查成果後自行安排GitHub流程。
