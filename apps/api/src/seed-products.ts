import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { z } from "zod";
import { db } from "./db.ts";

const manifestSchema = z.array(z.object({
    key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).default(""),
    priceCents: z.number().int().min(1).max(10000000),
    stock: z.number().int().min(0).max(1000000),
    images: z.array(z.string().min(1)).max(8).default([]),
}).strict()).min(1).refine(
    (products) => new Set(products.map((p) => p.key)).size === products.length,
    "Product keys must be unique.",
);

function productId(key: string) {
    const hex = createHash("sha256").update(`mandai:test-products:${key}`).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function seedProducts(manifestPath: string) {
    const products = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
    const root = await realpath(dirname(manifestPath));
    const actor = await db.user.findUnique({ where: { email: "admin@example.com" } });
    if (!actor || actor.role !== "ADMIN") {
        throw new Error("Run pnpm db:seed first; admin@example.com must have the ADMIN role.");
    }
    const uploadDirectory = resolve(process.env.UPLOAD_DIR ?? fileURLToPath(new URL("../../../uploads", import.meta.url)));

    // Validate every image before writing any products or files.
    const prepared = [];
    for (const product of products) {
        const buffers: Buffer[] = [];
        for (const image of product.images) {
            const path = await realpath(resolve(root, image));
            const local = relative(root, path);
            if (local === ".." || local.startsWith("../") || isAbsolute(local)) {
                throw new Error(`${product.key}: images must be inside the manifest directory.`);
            }
            const input = await readFile(path);
            if (input.length > 5 * 1024 * 1024) throw new Error(`${image}: exceeds 5 MB.`);
            const metadata = await sharp(input, { limitInputPixels: 40000000 }).metadata();
            if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) {
                throw new Error(`${image}: use a non-animated JPG, PNG, or WebP image.`);
            }
            buffers.push(await sharp(input, { limitInputPixels: 40000000 }).rotate().webp({ quality: 88 }).toBuffer());
        }
        prepared.push({ product, buffers });
    }

    let created = 0;
    let skipped = 0;
    for (const { product, buffers } of prepared) {
        const id = productId(product.key);
        const written: string[] = [];
        try {
            const inserted = await db.$transaction(async (tx) => {
                // Serialize imports of the same key across concurrent script runs.
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
                if (await tx.product.findUnique({ where: { id } })) return false;
                const { key: _key, images: _images, ...data } = product;
                await tx.product.create({ data: { id, ...data } });
                const imageIds: string[] = [];
                if (buffers.length) await mkdir(uploadDirectory, { recursive: true });
                for (const [position, buffer] of buffers.entries()) {
                    const filename = `${randomUUID()}.webp`;
                    const path = resolve(uploadDirectory, filename);
                    await writeFile(path, buffer, { flag: "wx" });
                    written.push(path);
                    const image = await tx.productImage.create({ data: {
                        productId: id, uploaderId: actor.id, filename,
                        mimeType: "image/webp", size: buffer.length, position,
                    } });
                    imageIds.push(image.id);
                }
                const coverImageId = imageIds[0] ?? null;
                await tx.product.update({ where: { id }, data: { coverImageId } });
                const movement = data.stock ? await tx.stockMovement.create({ data: {
                    productId: id, actorId: actor.id, actorEmail: actor.email,
                    delta: data.stock, stockAfter: data.stock, reason: "Initial inventory",
                } }) : null;
                const snapshot = { ...data, imageIds, coverImageId, deletedAt: null };
                await tx.productLog.create({ data: {
                    productId: id, productName: data.name, actorId: actor.id, actorEmail: actor.email,
                    action: "CREATE", movementId: movement?.id,
                    changes: Object.fromEntries(Object.entries(snapshot).map(([field, value]) => [field, { before: null, after: value }])),
                } });
                return true;
            }, { timeout: 30000, maxWait: 10000 });
            if (inserted) created++;
            else skipped++;
        } catch (error) {
            await Promise.all(written.map((path) => unlink(path).catch(() => {})));
            throw error;
        }
    }
    return { created, skipped };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const manifest = fileURLToPath(new URL("../../../test-products/products.json", import.meta.url));
        const result = await seedProducts(manifest);
        console.log(`Demo products: ${result.created} created, ${result.skipped} already present.`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    } finally {
        await db.$disconnect();
    }
}
