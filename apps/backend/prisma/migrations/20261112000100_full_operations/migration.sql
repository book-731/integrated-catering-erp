BEGIN;
-- CreateTable
CREATE TABLE "bundle_parts" (
    "parentId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "bundle_parts_pkey" PRIMARY KEY ("parentId","childId")
);

-- CreateTable
CREATE TABLE "option_groups" (
    "id" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_options" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "menu_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_recipes" (
    "optionId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "option_recipes_pkey" PRIMARY KEY ("optionId","ingredientId")
);

-- CreateTable
CREATE TABLE "command_receipts" (
    "id" VARCHAR(180) NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "before" DECIMAL(14,3) NOT NULL,
    "after" DECIMAL(14,3) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "actorId" UUID,
    "source" VARCHAR(180) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "reference" VARCHAR(200) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL,
    "serviceFee" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "paymentMethod" VARCHAR(20),
    "paidAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "contact" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    "note" VARCHAR(500) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_lines" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "received" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "lines" JSONB NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "contact" VARCHAR(200) NOT NULL,
    "jobId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "start" TIMESTAMPTZ(3) NOT NULL,
    "end" TIMESTAMPTZ(3) NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "start" TIMESTAMPTZ(3) NOT NULL,
    "end" TIMESTAMPTZ(3),
    "note" VARCHAR(500) NOT NULL,
    "actorId" UUID NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaves" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "start" TIMESTAMPTZ(3) NOT NULL,
    "end" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    "actorId" UUID NOT NULL,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_ingredientId_createdAt_idx" ON "stock_movements"("ingredientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_source_ingredientId_key" ON "stock_movements"("source", "ingredientId");

-- CreateIndex
CREATE INDEX "orders_createdAt_status_idx" ON "orders"("createdAt", "status");

-- CreateIndex
CREATE INDEX "order_lines_orderId_idx" ON "order_lines"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_lines_purchaseId_ingredientId_key" ON "purchase_lines"("purchaseId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_name_key" ON "jobs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_code_key" ON "employees"("code");

-- CreateIndex
CREATE INDEX "shifts_employeeId_start_end_idx" ON "shifts"("employeeId", "start", "end");

-- AddForeignKey
ALTER TABLE "bundle_parts" ADD CONSTRAINT "bundle_parts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_parts" ADD CONSTRAINT "bundle_parts_childId_fkey" FOREIGN KEY ("childId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_options" ADD CONSTRAINT "menu_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "option_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_recipes" ADD CONSTRAINT "option_recipes_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "menu_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_recipes" ADD CONSTRAINT "option_recipes_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE bundle_parts ADD CONSTRAINT bundle_positive CHECK(quantity>0 AND "parentId"<>"childId");
ALTER TABLE option_groups ADD CONSTRAINT group_limits CHECK("minSelect">=0 AND "maxSelect">=1 AND "minSelect"<="maxSelect");
ALTER TABLE menu_options ADD CONSTRAINT option_price CHECK(price>=0);
ALTER TABLE option_recipes ADD CONSTRAINT option_quantity CHECK(quantity>0);
ALTER TABLE stock_movements ADD CONSTRAINT movement_balanced CHECK("after"="before"+quantity AND "after">=0 AND "before">=0);
ALTER TABLE orders ADD CONSTRAINT order_totals CHECK(subtotal>=0 AND discount>=0 AND discount<=subtotal AND "serviceFee">=0 AND total=subtotal-discount+"serviceFee");
ALTER TABLE orders ADD CONSTRAINT order_state CHECK(status IN ('PENDING','PREPARING','COMPLETED','CANCELLED') AND type IN ('DINE_IN','TAKEAWAY','DELIVERY') AND revision>=0);
ALTER TABLE order_lines ADD CONSTRAINT line_totals CHECK(quantity>0 AND "unitPrice">=0 AND total=quantity*"unitPrice");
ALTER TABLE purchase_lines ADD CONSTRAINT purchase_quantities CHECK(quantity>0 AND received>=0 AND received<=quantity AND "unitCost">=0);
ALTER TABLE shifts ADD CONSTRAINT shift_interval CHECK("end">start);
ALTER TABLE attendance ADD CONSTRAINT attendance_interval CHECK("end" IS NULL OR "end">start);
ALTER TABLE leaves ADD CONSTRAINT leave_interval CHECK("end">start);
CREATE UNIQUE INDEX attendance_single_open ON attendance("employeeId") WHERE "end" IS NULL;
-- Adopt any pre-existing non-zero balances without changing quantities or deleting data.
INSERT INTO stock_movements(id,"ingredientId",type,quantity,"before","after",unit,reason,source)
SELECT gen_random_uuid(),id,'OPENING',"stockQuantity",0,"stockQuantity",unit,'遷移前既有庫存基準（保留原量）','migration:legacy-opening' FROM ingredients WHERE "stockQuantity"<>0;

COMMIT;
