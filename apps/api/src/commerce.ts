import { Router, type ErrorRequestHandler } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "./db.ts";
import { requireUser } from "./auth.ts";
import type { Prisma } from "./generated/prisma/client.ts";

type Tx = Prisma.TransactionClient;
class CommerceError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
function fail(status: number, code: string, message: string): never {
    throw new CommerceError(status, code, message);
}
const uuid = z.uuid().transform((id) => id.toLowerCase());
const quantity = z.number().int().min(1).max(100);
const version = z.number().int().min(0).max(2147483647);
const line = z
    .object({
        productId: uuid,
        quantity,
        priceCents: z.number().int().min(1).max(10000000),
    })
    .strict();
const checkoutInput = z
    .object({
        requestId: uuid,
        version,
        items: z
            .array(line)
            .min(1)
            .max(100)
            .refine(
                (items) =>
                    new Set(items.map((i) => i.productId)).size ===
                    items.length,
                "Duplicate products",
            ),
    })
    .strict();
const orderInclude = { items: { orderBy: { productId: "asc" as const } } };
function receipt(
    order: Prisma.OrderGetPayload<{ include: typeof orderInclude }>,
) {
    const {
        requestId: _requestId,
        requestHash: _requestHash,
        userId: _userId,
        ...result
    } = order;
    return result;
}
// Every cart write and checkout acquires this lock before touching cart items or products.
async function lockCart(tx: Tx, userId: string) {
    await tx.$executeRaw`INSERT INTO tbl_cart (user_id) VALUES (${userId}::uuid) ON CONFLICT DO NOTHING`;
    await tx.$queryRaw`SELECT user_id FROM tbl_cart WHERE user_id = ${userId}::uuid FOR UPDATE`;
    return tx.cart.findUniqueOrThrow({ where: { userId } });
}
function checkVersion(actual: number, expected: number) {
    if (actual !== expected)
        fail(
            409,
            "CART_CHANGED",
            "Your cart changed on another page or device. Review the refreshed cart and try again.",
        );
}
async function cartView(tx: Tx, userId: string, cartVersion: number) {
    const rows = await tx.cartItem.findMany({
        where: { userId },
        orderBy: { productId: "asc" },
        include: {
            product: { include: { images: { orderBy: { position: "asc" } } } },
        },
    });
    const items = rows.map(({ product: p, quantity }) => {
        const unavailableReason = p.deletedAt
            ? "This product is no longer available."
            : p.stock === 0
              ? "Out of stock."
              : p.stock < quantity
                ? `Only ${p.stock} available. Reduce the quantity to checkout.`
                : null;
        const cover =
            p.images.find((i) => i.id === p.coverImageId) ?? p.images[0];
        return {
            productId: p.id,
            name: p.name,
            quantity,
            priceCents: p.priceCents,
            stock: p.stock,
            imageUrl:
                cover && !p.deletedAt
                    ? `/api/product-images/${cover.id}`
                    : null,
            available: unavailableReason === null,
            unavailableReason,
            archived: p.deletedAt !== null,
        };
    });
    return {
        userId,
        version: cartVersion,
        items,
        totalAmountCents: items
            .reduce((n, i) => n + i.priceCents * i.quantity, 0),
    };
}
export const commerce = Router();
commerce.use(["/cart", "/checkout", "/orders"], requireUser);
commerce.get("/cart", async (_req, res) => {
    const userId = res.locals.user.id;
    const cart = await db.$transaction(async (tx) => {
        const cart = await lockCart(tx, userId);
        return cartView(tx, userId, cart.version);
    });
    res.json({ data: cart });
});
commerce.post("/cart/items", async (req, res) => {
    const input = z
        .object({ productId: uuid, quantity, version })
        .strict()
        .parse(req.body);
    const userId = res.locals.user.id;
    const result = await db.$transaction(async (tx) => {
        const cart = await lockCart(tx, userId);
        checkVersion(cart.version, input.version);
        const product = await tx.product.findFirst({
            where: { id: input.productId, deletedAt: null },
        });
        if (!product)
            fail(404, "PRODUCT_NOT_FOUND", "Product is no longer available.");
        const where = {
            userId_productId: { userId, productId: input.productId },
        };
        const existing = await tx.cartItem.findUnique({ where });
        const next = (existing?.quantity ?? 0) + input.quantity;
        if (next > 100)
            fail(
                400,
                "QUANTITY_LIMIT",
                "A cart item may contain at most 100 units.",
            );
        if (next > product.stock)
            fail(
                409,
                "INSUFFICIENT_STOCK",
                "There is not enough stock for this cart quantity.",
            );
        if (
            !existing &&
            (await tx.cartItem.count({ where: { userId } })) >= 100
        )
            fail(
                400,
                "CART_LIMIT",
                "A cart may contain at most 100 different products.",
            );
        await tx.cartItem.upsert({
            where,
            create: { userId, productId: input.productId, quantity: next },
            update: { quantity: next },
        });
        const after = await tx.cart.update({
            where: { userId },
            data: { version: { increment: 1 } },
        });
        return cartView(tx, userId, after.version);
    });
    res.status(201).json({ data: result });
});
commerce.patch("/cart/items/:id", async (req, res) => {
    const productId = uuid.parse(req.params.id);
    const input = z.object({ quantity, version }).strict().parse(req.body);
    const userId = res.locals.user.id;
    const result = await db.$transaction(async (tx) => {
        const cart = await lockCart(tx, userId);
        checkVersion(cart.version, input.version);
        const changed = await tx.cartItem.updateMany({
            where: { userId, productId },
            data: { quantity: input.quantity },
        });
        if (!changed.count)
            fail(
                404,
                "CART_ITEM_NOT_FOUND",
                "This item is no longer in your cart.",
            );
        const after = await tx.cart.update({
            where: { userId },
            data: { version: { increment: 1 } },
        });
        return cartView(tx, userId, after.version);
    });
    res.json({ data: result });
});
commerce.delete("/cart/items/:id", async (req, res) => {
    const productId = uuid.parse(req.params.id);
    const input = z.object({ version }).strict().parse(req.body);
    const userId = res.locals.user.id;
    const result = await db.$transaction(async (tx) => {
        const cart = await lockCart(tx, userId);
        checkVersion(cart.version, input.version);
        await tx.cartItem.deleteMany({ where: { userId, productId } });
        const after = await tx.cart.update({
            where: { userId },
            data: { version: { increment: 1 } },
        });
        return cartView(tx, userId, after.version);
    });
    res.json({ data: result });
});
commerce.post("/checkout", async (req, res) => {
    const input = checkoutInput.parse(req.body);
    const actor: { id: string; email: string } = res.locals.user;
    const items = [...input.items].sort((a, b) =>
        a.productId.localeCompare(b.productId),
    );
    const hash = createHash("sha256")
        .update(JSON.stringify({ version: input.version, items }))
        .digest("hex");
    const result = await db.$transaction(
        async (tx) => {
            const cart = await lockCart(tx, actor.id);
            // Check before the cart version: a successful checkout has already changed the cart.
            const previous = await tx.order.findUnique({
                where: {
                    userId_requestId: {
                        userId: actor.id,
                        requestId: input.requestId,
                    },
                },
                include: orderInclude,
            });
            if (previous) {
                if (previous.requestHash !== hash)
                    fail(
                        409,
                        "REQUEST_REUSED",
                        "This checkout reference was already used for a different request.",
                    );
                return { order: receipt(previous), replay: true };
            }
            checkVersion(cart.version, input.version);
            const cartItems = await tx.cartItem.findMany({
                where: { userId: actor.id },
            });
            if (cartItems.length !== items.length)
                fail(409, "CART_CHANGED", "Checkout must include your entire cart. Resolve unavailable items and review your cart.");
            for (const item of items) {
                if (
                    !cartItems.some(
                        (c) =>
                            c.productId === item.productId &&
                            c.quantity === item.quantity,
                    )
                )
                    fail(
                        409,
                        "CART_CHANGED",
                        "Your cart changed. Review the refreshed cart and try again.",
                    );
            }
            const purchased = [];
            let total = 0;
            // All purchases use the same lock order; admin operations lock one product at a time.
            for (const item of items) {
                await tx.$queryRaw`SELECT id FROM tbl_product WHERE id = ${item.productId}::uuid FOR UPDATE`;
                const p = await tx.product.findUnique({
                    where: { id: item.productId },
                });
                if (!p || p.deletedAt)
                    fail(
                        409,
                        "PRODUCT_UNAVAILABLE",
                        "A product is no longer available. Review the refreshed cart.",
                    );
                if (p.stock < item.quantity)
                    fail(
                        409,
                        "INSUFFICIENT_STOCK",
                        "An item no longer has enough stock. Review the refreshed cart and checkout again.",
                    );
                if (p.priceCents !== item.priceCents)
                    fail(
                        409,
                        "PRICE_CHANGED",
                        "A product price changed. Review the new total before checking out again.",
                    );
                const changed =
                    await tx.$executeRaw`UPDATE tbl_product SET stock = stock - ${item.quantity}, stock_version = stock_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ${p.id}::uuid AND deleted_at IS NULL AND stock >= ${item.quantity}`;
                if (changed !== 1)
                    fail(
                        409,
                        "INSUFFICIENT_STOCK",
                        "Stock changed. Review your cart.",
                    );
                total += p.priceCents * item.quantity;
                purchased.push({ product: p, quantity: item.quantity });
            }
            if (total > 1000000000)
                fail(
                    400,
                    "ORDER_LIMIT",
                    "The order total exceeds the limit. Reduce the quantities or remove items.",
                );
            const order = await tx.order.create({
                data: {
                    userId: actor.id,
                    totalAmountCents: total,
                    requestId: input.requestId,
                    requestHash: hash,
                    items: {
                        create: purchased.map(({ product: p, quantity }) => ({
                            productId: p.id,
                            productName: p.name,
                            quantity,
                            unitPriceCents: p.priceCents,
                        })),
                    },
                },
                include: orderInclude,
            });
            for (const { product: p, quantity } of purchased) {
                const movement = await tx.stockMovement.create({
                    data: {
                        productId: p.id,
                        actorId: actor.id,
                        actorEmail: actor.email,
                        delta: -quantity,
                        stockAfter: p.stock - quantity,
                        reason: `Purchase ${order.id}`,
                    },
                });
                await tx.productLog.create({
                    data: {
                        productId: p.id,
                        productName: p.name,
                        actorId: actor.id,
                        actorEmail: actor.email,
                        action: "PURCHASE",
                        movementId: movement.id,
                        changes: {
                            stock: {
                                before: p.stock,
                                after: p.stock - quantity,
                            },
                            quantity,
                            orderId: order.id,
                        },
                    },
                });
            }
            await tx.cartItem.deleteMany({
                where: {
                    userId: actor.id,
                    productId: { in: items.map((i) => i.productId) },
                },
            });
            await tx.cart.update({
                where: { userId: actor.id },
                data: { version: { increment: 1 } },
            });
            return { order: receipt(order), replay: false };
        },
        { isolationLevel: "ReadCommitted", timeout: 15000, maxWait: 10000 },
    );
    res.status(result.replay ? 200 : 201).json({ data: result.order });
});
commerce.get("/orders", async (req, res) => {
    const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .default(1)
        .parse(req.query.page);
    const where = { userId: res.locals.user.id as string };
    const [orders, total] = await db.$transaction([
        db.order.findMany({
            where,
            include: orderInclude,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (page - 1) * 20,
            take: 20,
        }),
        db.order.count({ where }),
    ]);
    res.json({
        data: { items: orders.map(receipt), total, page, pageSize: 20 },
    });
});
commerce.get("/orders/:id", async (req, res) => {
    const id = uuid.parse(req.params.id);
    const order = await db.order.findFirst({
        where: { id, userId: res.locals.user.id },
        include: orderInclude,
    });
    if (!order) fail(404, "ORDER_NOT_FOUND", "Order not found.");
    res.json({ data: receipt(order) });
});
export const adminOrders = Router();
const adminOrderInclude = { ...orderInclude, user: { select: { email: true } } };
function adminReceipt(order: Prisma.OrderGetPayload<{ include: typeof adminOrderInclude }>) {
    const { user, ...rest } = order;
    return { ...receipt(rest), customerEmail: user.email };
}
adminOrders.get("/orders", async (req, res) => {
    const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
    const [orders, total] = await db.$transaction([
        db.order.findMany({
            include: adminOrderInclude,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (page - 1) * 20,
            take: 20,
        }),
        db.order.count(),
    ]);
    res.json({ data: { items: orders.map(adminReceipt), total, page, pageSize: 20 } });
});
adminOrders.get("/orders/:id", async (req, res) => {
    const id = uuid.parse(req.params.id);
    const order = await db.order.findUnique({ where: { id }, include: adminOrderInclude });
    if (!order) fail(404, "ORDER_NOT_FOUND", "Order not found.");
    res.json({ data: adminReceipt(order) });
});
export const commerceErrorHandler: ErrorRequestHandler = (
    error,
    _req,
    res,
    next,
) => {
    if (error instanceof CommerceError) {
        res.status(error.status).json({
            error: error.code,
            message: error.message,
        });
        return;
    }
    next(error);
};
