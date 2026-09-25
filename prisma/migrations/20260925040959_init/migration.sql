-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'USER');

-- CreateTable
CREATE TABLE "tbl_user"
(
    "id"            UUID           NOT NULL,
    "email"         VARCHAR(255)   NOT NULL,
    "password_hash" VARCHAR(255)   NOT NULL,
    "role"          "user_role"    NOT NULL DEFAULT 'USER',
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_product"
(
    "id"            UUID           NOT NULL,
    "name"          VARCHAR(120)   NOT NULL,
    "description"   VARCHAR(2000)  NOT NULL DEFAULT '',
    "price_cents"   INTEGER        NOT NULL,
    "stock"         INTEGER        NOT NULL,
    "stock_version" INTEGER        NOT NULL DEFAULT 0,
    "deleted_at"    TIMESTAMPTZ(6),
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_order"
(
    "id"                 UUID           NOT NULL,
    "user_id"            UUID           NOT NULL,
    "total_amount_cents" INTEGER        NOT NULL,
    "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_order_item"
(
    "id"               UUID    NOT NULL,
    "order_id"         UUID    NOT NULL,
    "product_id"       UUID    NOT NULL,
    "quantity"         INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,

    CONSTRAINT "tbl_order_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_user_email_key" ON "tbl_user" ("email");

-- CreateIndex
CREATE INDEX "tbl_order_user_id_idx" ON "tbl_order" ("user_id");

-- CreateIndex
CREATE INDEX "tbl_order_item_order_id_idx" ON "tbl_order_item" ("order_id");

-- CreateIndex
CREATE INDEX "tbl_order_item_product_id_idx" ON "tbl_order_item" ("product_id");

-- AddForeignKey
ALTER TABLE "tbl_order"
    ADD CONSTRAINT "tbl_order_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_order_item"
    ADD CONSTRAINT "tbl_order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "tbl_order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_order_item"
    ADD CONSTRAINT "tbl_order_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tbl_product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database invariants that Prisma Schema Language cannot express.
ALTER TABLE "tbl_product"
    ADD CONSTRAINT "tbl_product_stock_nonnegative" CHECK ("stock" >= 0),
    ADD CONSTRAINT "tbl_product_stock_limit" CHECK ("stock" <= 1000000),
    ADD CONSTRAINT "tbl_product_price_cents_range" CHECK ("price_cents" BETWEEN 1 AND 10000000),
    ADD CONSTRAINT "tbl_product_stock_version_nonnegative" CHECK ("stock_version" >= 0);

ALTER TABLE "tbl_order"
    ADD CONSTRAINT "tbl_order_total_amount_cents_range" CHECK ("total_amount_cents" BETWEEN 1 AND 1000000000);

ALTER TABLE "tbl_order_item"
    ADD CONSTRAINT "tbl_order_item_quantity_range" CHECK ("quantity" BETWEEN 1 AND 100),
    ADD CONSTRAINT "tbl_order_item_unit_price_cents_range" CHECK ("unit_price_cents" BETWEEN 1 AND 10000000);
