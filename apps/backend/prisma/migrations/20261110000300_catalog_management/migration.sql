BEGIN;
-- Additive only: keep all accepted migrations and business rows.
ALTER TABLE "menu_categories" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "menu_items" ADD COLUMN "recipeVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_recipe_version_nonnegative" CHECK ("recipeVersion" >= 0);
-- Fail safely on legacy duplicates. Do not merge, rename, or delete existing data.
CREATE UNIQUE INDEX "ingredients_sku_normalized_key" ON "ingredients" (lower(btrim("sku")));
CREATE UNIQUE INDEX "menu_categories_name_normalized_key" ON "menu_categories" (lower(btrim("name")));
COMMIT;
