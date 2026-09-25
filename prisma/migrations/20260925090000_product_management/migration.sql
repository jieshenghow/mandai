-- AlterTable
ALTER TABLE "tbl_product" ADD COLUMN     "cover_image_id" UUID;

-- CreateTable
CREATE TABLE "tbl_product_image" (
    "id" UUID NOT NULL,
    "product_id" UUID,
    "uploader_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_product_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_stock_movement" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_email" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "stock_after" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_product_log" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "movement_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_product_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_product_image_filename_key" ON "tbl_product_image"("filename");

-- CreateIndex
CREATE INDEX "tbl_product_image_product_id_idx" ON "tbl_product_image"("product_id");

-- CreateIndex
CREATE INDEX "tbl_stock_movement_product_id_created_at_idx" ON "tbl_stock_movement"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "tbl_product_log_created_at_id_idx" ON "tbl_product_log"("created_at", "id");

-- CreateIndex
CREATE INDEX "tbl_product_log_product_id_created_at_idx" ON "tbl_product_log"("product_id", "created_at");

-- AddForeignKey
ALTER TABLE "tbl_product_image" ADD CONSTRAINT "tbl_product_image_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tbl_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_stock_movement" ADD CONSTRAINT "tbl_stock_movement_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tbl_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
