import { Router } from "express";
import { requireAuth } from "./auth.ts";
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { db } from "./db.ts";
import type { Prisma } from "./generated/prisma/client.ts";

export const uploadDirectory = resolve(
    process.env.UPLOAD_DIR ??
        new URL("../../../uploads", import.meta.url).pathname,
);
const uuid = z.uuid();
const imageFields = {
    imageIds: z
        .array(uuid)
        .max(8)
        .refine((ids) => new Set(ids).size === ids.length, "Duplicate images")
        .optional(),
    coverImageId: uuid.nullable().optional(),
};
const fields = {
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000),
    priceCents: z.number().int().min(1).max(10000000),
};
const createSchema = z
    .object({
        ...fields,
        description: fields.description.default(""),
        stock: z.number().int().min(0).max(1000000).default(0),
        ...imageFields,
    })
    .strict();
const editSchema = z.object(fields).partial().extend(imageFields).strict();
const includeImages = { images: { orderBy: { position: "asc" as const } } };
type Tx = Prisma.TransactionClient;
type Actor = { id: string; email: string };
class ProductError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
function fail(status: number, code: string, message: string): never {
    throw new ProductError(status, code, message);
}
async function lockedProduct(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM tbl_product WHERE id = ${id}::uuid FOR UPDATE`;
    const product = await tx.product.findFirst({
        where: { id, deletedAt: null },
        include: includeImages,
    });
    if (!product)
        fail(404, "PRODUCT_NOT_FOUND", "Product not found or archived.");
    return product;
}
function snapshot(p: Awaited<ReturnType<typeof lockedProduct>>) {
    return {
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        stock: p.stock,
        imageIds: p.images.map((i) => i.id),
        coverImageId: p.coverImageId,
        deletedAt: p.deletedAt?.toISOString() ?? null,
    };
}
function differences(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
) {
    return Object.fromEntries(
        Object.keys(after)
            .filter(
                (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
            )
            .map((k) => [k, { before: before[k] ?? null, after: after[k] }]),
    ) as Prisma.InputJsonObject;
}
async function log(
    tx: Tx,
    actor: Actor,
    product: { id: string; name: string },
    action: string,
    changes: Prisma.InputJsonObject,
    movementId?: string,
) {
    return tx.productLog.create({
        data: {
            productId: product.id,
            productName: product.name,
            actorId: actor.id,
            actorEmail: actor.email,
            action,
            changes,
            movementId,
        },
    });
}
async function attachImages(
    tx: Tx,
    productId: string,
    actor: Actor,
    ids: string[],
    requestedCover?: string | null,
) {
    // Lock in a stable order so concurrent forms cannot claim the same temporary upload.
    for (const id of [...ids].sort()) {
        await tx.$queryRaw`SELECT id FROM tbl_product_image WHERE id = ${id}::uuid FOR UPDATE`;
        const image = await tx.productImage.findUnique({ where: { id } });
        if (
            !image ||
            (image.productId !== productId &&
                (image.productId !== null || image.uploaderId !== actor.id))
        )
            fail(
                400,
                "INVALID_IMAGE",
                "An image is unavailable or belongs to another product. Upload it again.",
            );
    }
    const cover = requestedCover ?? ids[0] ?? null;
    if (cover && !ids.includes(cover))
        fail(
            400,
            "INVALID_IMAGE",
            "The cover must be one of this product's images.",
        );
    await tx.productImage.updateMany({
        where: { productId, id: { notIn: ids } },
        data: { productId: null, createdAt: new Date() },
    });
    for (const [position, id] of ids.entries())
        await tx.productImage.update({
            where: { id },
            data: { productId, position },
        });
    await tx.product.update({
        where: { id: productId },
        data: { coverImageId: cover },
    });
}
function serialize(p: Awaited<ReturnType<typeof lockedProduct>>, admin = true) {
    const { images, stockVersion, ...rest } = p;
    return {
        ...rest,
        ...(admin ? { stockVersion } : {}),
        images: images.map(({ id, position }) => ({
            id,
            position,
            url: `/api/product-images/${id}`,
        })),
    };
}
export const products = Router();
export const adminProducts = Router();
products.get("/products", async (_req, res) => {
    const rows = await db.product.findMany({
        where: { deletedAt: null },
        include: includeImages,
        orderBy: { createdAt: "desc" },
    });
    res.json({ data: rows.map((p) => serialize(p, false)) });
});
products.get("/products/:id", async (req, res) => {
    const id = uuid.parse(req.params.id);
    const p = await db.product.findFirst({
        where: { id, deletedAt: null },
        include: includeImages,
    });
    if (!p) fail(404, "PRODUCT_NOT_FOUND", "Product not found.");
    res.json({ data: serialize(p, false) });
});
products.get("/product-images/:id", async (req, res, next) => {
    const id = uuid.parse(req.params.id);
    const image = await db.productImage.findUnique({
        where: { id },
        include: { product: true },
    });
    // Public files must belong to an active product. Unattached uploads stay private.
    if (image && !image.productId && !res.locals.user) {
        await requireAuth(req, res, () => {});
        if (!res.locals.user) return;
    }
    const actor = res.locals.user;
    if (
        !image ||
        (image.productId
            ? image.product?.deletedAt !== null
            : actor?.role !== "ADMIN" || image.uploaderId !== actor?.id)
    )
        fail(404, "IMAGE_NOT_FOUND", "Image not found.");
    res.set({
        "Content-Type": image.mimeType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
    });
    res.sendFile(image.filename, { root: uploadDirectory }, (error) => {
        if (error) {
            res.removeHeader("Content-Type");
            next(error);
        }
    });
});
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
});
adminProducts.post(
    "/product-images",
    upload.single("image"),
    async (req, res) => {
        if (!req.file)
            fail(
                400,
                "INVALID_IMAGE",
                "Choose a JPG, PNG or WebP image up to 5 MB.",
            );
        let buffer: Buffer;
        try {
            const metadata = await sharp(req.file.buffer, {
                limitInputPixels: 40000000,
            }).metadata();
            if (
                !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
                (metadata.pages ?? 1) > 1
            )
                throw new Error("Unsupported image");
            // Decode and re-encode: reject malformed files and strip metadata/embedded payloads.
            buffer = await sharp(req.file.buffer, {
                limitInputPixels: 40000000,
            })
                .rotate()
                .webp({ quality: 88 })
                .toBuffer();
        } catch {
            fail(
                400,
                "INVALID_IMAGE",
                "Use a valid, non-animated JPG, PNG or WebP image (up to 40 megapixels).",
            );
        }
        await mkdir(uploadDirectory, { recursive: true });
        const filename = `${randomUUID()}.webp`;
        await writeFile(resolve(uploadDirectory, filename), buffer, {
            flag: "wx",
        });
        try {
            const image = await db.productImage.create({
                data: {
                    filename,
                    uploaderId: res.locals.user.id,
                    mimeType: "image/webp",
                    size: buffer.length,
                },
            });
            res.status(201).json({
                data: {
                    id: image.id,
                    url: `/api/product-images/${image.id}`,
                    position: 0,
                },
            });
        } catch (error) {
            await unlink(resolve(uploadDirectory, filename)).catch(() => {});
            throw error;
        }
    },
);
adminProducts.get("/products", async (_req, res) => {
    res.json({
        data: (
            await db.product.findMany({
                where: { deletedAt: null },
                include: includeImages,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            })
        ).map((p) => serialize(p)),
    });
});
adminProducts.get("/products/:id", async (req, res) => {
    const id = uuid.parse(req.params.id);
    const p = await db.product.findFirst({
        where: { id, deletedAt: null },
        include: includeImages,
    });
    if (!p) fail(404, "PRODUCT_NOT_FOUND", "Product not found.");
    res.json({ data: serialize(p) });
});
adminProducts.post("/products", async (req, res) => {
    const {
        imageIds = [],
        coverImageId,
        ...data
    } = createSchema.parse(req.body);
    const actor: Actor = res.locals.user;
    const p = await db.$transaction(async (tx) => {
        const p = await tx.product.create({ data });
        await attachImages(tx, p.id, actor, imageIds, coverImageId);
        const final = await lockedProduct(tx, p.id);
        let movementId: string | undefined;
        if (p.stock)
            movementId = (
                await tx.stockMovement.create({
                    data: {
                        productId: p.id,
                        actorId: actor.id,
                        actorEmail: actor.email,
                        delta: p.stock,
                        stockAfter: p.stock,
                        reason: "Initial inventory",
                    },
                })
            ).id;
        await log(
            tx,
            actor,
            p,
            "CREATE",
            differences({}, snapshot(final)),
            movementId,
        );
        return final;
    });
    res.status(201).json({ data: serialize(p) });
});
adminProducts.patch("/products/:id", async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { imageIds, coverImageId, ...data } = editSchema.parse(req.body);
    const actor: Actor = res.locals.user;
    const p = await db.$transaction(async (tx) => {
        const before = await lockedProduct(tx, id);
        if (Object.keys(data).length)
            await tx.product.update({ where: { id }, data });
        if (imageIds !== undefined || coverImageId !== undefined) {
            const ids = imageIds ?? before.images.map((i) => i.id);
            const cover =
                coverImageId === undefined &&
                before.coverImageId &&
                ids.includes(before.coverImageId)
                    ? before.coverImageId
                    : coverImageId;
            await attachImages(tx, id, actor, ids, cover);
        }
        const after = await lockedProduct(tx, id);
        const changes = differences(snapshot(before), snapshot(after));
        if (Object.keys(changes).length)
            await log(tx, actor, after, "UPDATE", changes);
        return after;
    });
    res.json({ data: serialize(p) });
});
adminProducts.delete("/products/:id", async (req, res) => {
    const id = uuid.parse(req.params.id);
    const result = await db.$transaction(async (tx) => {
        const before = await lockedProduct(tx, id);
        const after = await tx.product.update({
            where: { id },
            data: { deletedAt: new Date() },
            include: includeImages,
        });
        await log(tx, res.locals.user, before, "ARCHIVE", {
            snapshot: snapshot(before),
            ...differences(snapshot(before), snapshot(after)),
        } as Prisma.InputJsonObject);
        return { id, deletedAt: after.deletedAt };
    });
    res.json({ data: result });
});
adminProducts.get("/products/:id/stock-movements", async (req, res) => {
    const id = uuid.parse(req.params.id);
    if (!(await db.product.findUnique({ where: { id } })))
        fail(404, "PRODUCT_NOT_FOUND", "Product not found.");
    res.json({
        data: await db.stockMovement.findMany({
            where: { productId: id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
    });
});
adminProducts.post("/products/:id/stock-movements", async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z
        .object({
            type: z.enum(["IN", "OUT"]),
            quantity: z.number().int().min(1).max(1000000),
            reason: z.string().trim().min(1).max(500),
        })
        .strict()
        .parse(req.body);
    const actor: Actor = res.locals.user;
    const result = await db.$transaction(async (tx) => {
        const before = await lockedProduct(tx, id);
        const delta = input.type === "IN" ? input.quantity : -input.quantity;
        const stock = before.stock + delta;
        if (stock < 0 || stock > 1000000)
            fail(
                409,
                "STOCK_LIMIT",
                "Insufficient stock or inventory limit exceeded. Reload the current inventory.",
            );
        const after = await tx.product.update({
            where: { id },
            data: {
                stock: { increment: delta },
                stockVersion: { increment: 1 },
            },
            include: includeImages,
        });
        const movement = await tx.stockMovement.create({
            data: {
                productId: id,
                actorId: actor.id,
                actorEmail: actor.email,
                delta,
                stockAfter: stock,
                reason: input.reason,
            },
        });
        await log(
            tx,
            actor,
            after,
            input.type === "IN" ? "STOCK_IN" : "STOCK_OUT",
            {
                stock: { before: before.stock, after: stock },
                quantity: input.quantity,
                reason: input.reason,
            },
            movement.id,
        );
        return { product: serialize(after), movement };
    });
    res.status(201).json({ data: result });
});
adminProducts.get("/product-logs", async (req, res) => {
    const query = z
        .object({
            productId: uuid.optional(),
            product: z.string().max(120).optional(),
            actor: z.string().max(255).optional(),
            action: z
                .enum(["CREATE", "UPDATE", "ARCHIVE", "STOCK_IN", "STOCK_OUT", "PURCHASE"])
                .optional(),
            from: z.iso.datetime().optional(),
            to: z.iso.datetime().optional(),
            page: z.coerce.number().int().min(1).max(100000).default(1),
        })
        .parse(req.query);
    if (query.from && query.to && query.from > query.to)
        fail(
            400,
            "VALIDATION_ERROR",
            "The end date must follow the start date.",
        );
    const where: Prisma.ProductLogWhereInput = {
        productId: query.productId,
        productName: query.product
            ? { contains: query.product, mode: "insensitive" }
            : undefined,
        actorEmail: query.actor
            ? { contains: query.actor, mode: "insensitive" }
            : undefined,
        action: query.action,
        createdAt: { gte: query.from, lte: query.to },
    };
    const [items, total] = await db.$transaction([
        db.productLog.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (query.page - 1) * 20,
            take: 20,
        }),
        db.productLog.count({ where }),
    ]);
    res.json({ data: { items, total, page: query.page, pageSize: 20 } });
});
export const productErrorHandler: import("express").ErrorRequestHandler = (
    error,
    _req,
    res,
    next,
) => {
    if (error instanceof z.ZodError) {
        res.status(400).json({
            error: "VALIDATION_ERROR",
            message: "Check the form values.",
            details: error.issues,
        });
        return;
    }
    if (error instanceof multer.MulterError) {
        res.status(400).json({
            error: "INVALID_IMAGE",
            message: "Upload one image at a time, up to 5 MB.",
        });
        return;
    }
    if (error instanceof ProductError) {
        res.status(error.status).json({
            error: error.code,
            message: error.message,
        });
        return;
    }
    if (error.code === "ENOENT" || error.status === 404) {
        res.status(404).json({
            error: "IMAGE_NOT_FOUND",
            message: "Image not found.",
        });
        return;
    }
    next(error);
};

export async function cleanupImages() {
    await mkdir(uploadDirectory, { recursive: true });
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // DELETE locks each row and rechecks its predicate against concurrent attachment.
    const removed = await db.$queryRaw<
        { filename: string }[]
    >`DELETE FROM tbl_product_image WHERE product_id IS NULL AND created_at < ${cutoff} RETURNING filename`;
    for (const row of removed)
        await unlink(resolve(uploadDirectory, row.filename)).catch(() => {});
    // Recover files left behind by an interrupted upload or an earlier unlink failure.
    for (const filename of await readdir(uploadDirectory)) {
        if (!/^[a-f0-9-]+\.webp$/.test(filename)) continue;
        const path = resolve(uploadDirectory, filename);
        const info = await stat(path).catch(() => null);
        if (
            info &&
            info.mtime < cutoff &&
            !(await db.productImage.findUnique({ where: { filename } }))
        )
            await unlink(path).catch(() => {});
    }
}
