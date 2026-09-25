CREATE TABLE "tbl_cart" (
  "user_id" UUID PRIMARY KEY REFERENCES "tbl_user"("id") ON DELETE CASCADE,
  "version" INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0)
);
CREATE TABLE "tbl_cart_item" (
  "user_id" UUID NOT NULL REFERENCES "tbl_cart"("user_id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "tbl_product"("id") ON DELETE RESTRICT,
  "quantity" INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX "tbl_cart_item_product_id_idx" ON "tbl_cart_item"("product_id");
ALTER TABLE "tbl_order" ADD COLUMN "request_id" UUID, ADD COLUMN "request_hash" TEXT;
CREATE UNIQUE INDEX "tbl_order_user_id_request_id_key" ON "tbl_order"("user_id", "request_id");
ALTER TABLE "tbl_order_item" ADD COLUMN "product_name" VARCHAR(120);
UPDATE "tbl_order_item" i SET "product_name" = p.name FROM "tbl_product" p WHERE i.product_id = p.id;
ALTER TABLE "tbl_order_item" ALTER COLUMN "product_name" SET NOT NULL;
