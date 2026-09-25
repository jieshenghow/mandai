import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import request from "supertest";

const source = new URL(process.env.DATABASE_URL!);
const databaseName = `mandai_commerce_test_${process.pid}_${Date.now()}`;
const control = new pg.Client({ connectionString: source.toString() });
await control.connect();
await control.query(`CREATE DATABASE "${databaseName}"`);
source.pathname = `/${databaseName}`;
process.env.DATABASE_URL = source.toString();
const setup = new pg.Client({ connectionString: source.toString() });
await setup.connect();
const migrations = new URL("../../../prisma/migrations/", import.meta.url);
for (const name of (await readdir(migrations))
    .filter((n) => /^\d/.test(n))
    .sort())
    await setup.query(
        await readFile(new URL(`${name}/migration.sql`, migrations), "utf8"),
    );
const { default: app } = await import("../src/app.ts");
const { db } = await import("../src/db.ts");
after(async () => {
    await db.$disconnect();
    await setup.end();
    await control.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await control.end();
});
async function account(admin = false) {
    const agent = request.agent(app);
    const response = await agent
        .post("/api/auth/register")
        .send({
            email: `${randomUUID()}@example.com`,
            password: "Password123!",
        })
        .expect(201);
    const id = response.body.data.id as string;
    if (admin) await db.user.update({ where: { id }, data: { role: "ADMIN" } });
    return { agent, id };
}
type Account = Awaited<ReturnType<typeof account>>;
async function product(stock = 5, priceCents = 1200) {
    return db.product.create({
        data: { name: "Safari mug", description: "Ceramic", stock, priceCents },
    });
}
async function cart(user: Account) {
    return (await user.agent.get("/api/cart").expect(200)).body.data;
}
async function add(user: Account, productId: string, quantity = 1) {
    const current = await cart(user);
    return (
        await user.agent
            .post("/api/cart/items")
            .send({ productId, quantity, version: current.version })
            .expect(201)
    ).body.data;
}
async function input(user: Account) {
    const c = await cart(user);
    return {
        version: c.version,
        requestId: randomUUID(),
        items: c.items
            .filter((i: { available: boolean }) => i.available)
            .map(
                (i: {
                    productId: string;
                    quantity: number;
                    priceCents: number;
                }) => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    priceCents: i.priceCents,
                }),
            ),
    };
}

test("database cart, ownership, validation, stale version and unavailable items", async () => {
    await request(app).get("/api/cart").expect(401);
    await request(app).post("/api/checkout").send({}).expect(401);
    const a = await account(),
        b = await account(),
        p = await product();
    const initial = await cart(a);
    await a.agent
        .post("/api/cart/items")
        .send({ productId: p.id, quantity: 0, version: initial.version })
        .expect(400);
    for (const quantity of [-1, 1.5, 101, "2"])
        await a.agent
            .post("/api/cart/items")
            .send({ productId: p.id, quantity, version: initial.version })
            .expect(400);
    await add(a, p.id, 2);
    assert.equal((await cart(a)).items[0].quantity, 2);
    assert.equal((await cart(b)).items.length, 0);
    const secondDevice = request.agent(app);
    const user = await db.user.findUniqueOrThrow({ where: { id: a.id } });
    await secondDevice
        .post("/api/auth/login")
        .send({ email: user.email, password: "Password123!" })
        .expect(200);
    assert.equal(
        (await secondDevice.get("/api/cart").expect(200)).body.data.items[0]
            .quantity,
        2,
    );
    await a.agent
        .patch(`/api/cart/items/${p.id}`)
        .send({ version: initial.version, quantity: 3 })
        .expect(409);
    await b.agent
        .patch(`/api/cart/items/${p.id}`)
        .send({ version: 0, quantity: 3 })
        .expect(404);
    const c = await cart(a);
    const edits = await Promise.all(
        [2, 3].map((quantity) =>
            a.agent
                .patch(`/api/cart/items/${p.id}`)
                .send({ quantity, version: c.version }),
        ),
    );
    assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
    await db.product.update({ where: { id: p.id }, data: { stock: 0 } });
    assert.equal((await cart(a)).items[0].available, false);
    await db.product.update({ where: { id: p.id }, data: { stock: 1 } });
    assert.match((await cart(a)).items[0].unavailableReason, /Reduce/);
    await db.product.update({
        where: { id: p.id },
        data: { deletedAt: new Date() },
    });
    assert.equal((await cart(a)).items[0].archived, true);
    const beforeDelete = await cart(a);
    await a.agent
        .delete(`/api/cart/items/${p.id}`)
        .send({ version: beforeDelete.version })
        .expect(200);
    assert.equal((await cart(a)).items.length, 0);
});

test("checkout skips known unavailable items, preserves snapshots, logs and private order history", async () => {
    const a = await account(),
        b = await account(),
        p = await product(),
        unavailable = await product();
    await add(a, p.id, 2);
    await add(a, unavailable.id);
    await db.product.update({
        where: { id: unavailable.id },
        data: { stock: 0 },
    });
    const body = await input(a);
    assert.equal(body.items.length, 1);
    const order = (await a.agent.post("/api/checkout").send(body).expect(201))
        .body.data;
    assert.equal(order.totalAmountCents, 2400);
    assert.equal(order.items[0].productName, "Safari mug");
    assert.equal(order.requestHash, undefined);
    assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
        3,
    );
    assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: p.id } }))
            .stockVersion,
        1,
    );
    assert.deepEqual(
        (await cart(a)).items.map((i: { productId: string }) => i.productId),
        [unavailable.id],
    );
    const movement = await db.stockMovement.findFirstOrThrow({
        where: { productId: p.id },
    });
    assert.equal(movement.delta, -2);
    assert.equal(movement.stockAfter, 3);
    assert.equal(
        await db.productLog.count({
            where: { productId: p.id, action: "PURCHASE" },
        }),
        1,
    );
    await db.product.update({
        where: { id: p.id },
        data: { name: "New name", priceCents: 9999, deletedAt: new Date() },
    });
    const detail = (await a.agent.get(`/api/orders/${order.id}`).expect(200))
        .body.data;
    assert.equal(detail.items[0].productName, "Safari mug");
    assert.equal(detail.items[0].unitPriceCents, 1200);
    assert.equal(
        (await a.agent.get("/api/orders").expect(200)).body.data.total,
        1,
    );
    assert.equal(
        (await b.agent.get("/api/orders").expect(200)).body.data.total,
        0,
    );
    await b.agent.get(`/api/orders/${order.id}`).expect(404);
    await request(app).get(`/api/orders/${order.id}`).expect(401);
    const emptyInput = await input(a);
    await a.agent.post("/api/checkout").send(emptyInput).expect(400);
});

test("two users racing for the last unit produce exactly one order", async () => {
    const a = await account(),
        b = await account(),
        p = await product(1);
    await add(a, p.id);
    await add(b, p.id);
    const aa = await input(a),
        bb = await input(b);
    const responses = await Promise.all([
        a.agent.post("/api/checkout").send(aa),
        b.agent.post("/api/checkout").send(bb),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
        0,
    );
    assert.equal(await db.orderItem.count({ where: { productId: p.id } }), 1);
    assert.equal(
        await db.stockMovement.count({ where: { productId: p.id } }),
        1,
    );
    assert.equal(await db.cartItem.count({ where: { productId: p.id } }), 1);
});

test("many simultaneous buyers never oversell", async () => {
    const p = await product(3);
    const buyers = await Promise.all(
        Array.from({ length: 12 }, () => account()),
    );
    await Promise.all(buyers.map((b) => add(b, p.id)));
    const bodies = await Promise.all(buyers.map(input));
    const responses = await Promise.all(
        buyers.map((b, i) => b.agent.post("/api/checkout").send(bodies[i])),
    );
    assert.equal(responses.filter((r) => r.status === 201).length, 3);
    assert.equal(responses.filter((r) => r.status === 409).length, 9);
    assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
        0,
    );
    assert.equal(await db.orderItem.count({ where: { productId: p.id } }), 3);
});

test("same request is idempotent under concurrency and after a lost response", async () => {
    const a = await account(),
        p = await product(5);
    await add(a, p.id);
    const body = await input(a);
    const results = await Promise.all([
        a.agent.post("/api/checkout").send(body),
        a.agent.post("/api/checkout").send(body),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
    assert.equal(results[0].body.data.id, results[1].body.data.id);
    const replay = await a.agent.post("/api/checkout").send(body).expect(200);
    assert.equal(replay.body.data.id, results[0].body.data.id);
    await a.agent
        .post("/api/checkout")
        .send({ ...body, version: body.version + 1 })
        .expect(409);
    assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
        4,
    );
    assert.equal(await db.order.count({ where: { userId: a.id } }), 1);
});

test("different request IDs cannot purchase the same cart twice", async () => {
    const a = await account(),
        p = await product(5);
    await add(a, p.id);
    const body = await input(a);
    const results = await Promise.all([
        a.agent.post("/api/checkout").send(body),
        a.agent
            .post("/api/checkout")
            .send({ ...body, requestId: randomUUID() }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await db.order.count({ where: { userId: a.id } }), 1);
});

test("multi-item late stock/price/archive conflict rolls back all earlier deductions", async () => {
    for (const change of [
        { stock: 0 },
        { priceCents: 1500 },
        { deletedAt: new Date() },
    ]) {
        const a = await account();
        const products = (await Promise.all([product(), product()])).sort(
            (a, b) => a.id.localeCompare(b.id),
        );
        for (const p of products) await add(a, p.id);
        const body = await input(a);
        await db.product.update({
            where: { id: products[1].id },
            data: change,
        });
        await a.agent.post("/api/checkout").send(body).expect(409);
        assert.equal(
            (
                await db.product.findUniqueOrThrow({
                    where: { id: products[0].id },
                })
            ).stock,
            5,
        );
        assert.equal(
            (
                await db.product.findUniqueOrThrow({
                    where: { id: products[0].id },
                })
            ).stockVersion,
            0,
        );
        assert.equal(await db.order.count({ where: { userId: a.id } }), 0);
        assert.equal(
            await db.stockMovement.count({ where: { actorId: a.id } }),
            0,
        );
        assert.equal((await cart(a)).items.length, 2);
    }
});

test("opposite product input order uses stable locking and both purchases complete", async () => {
    const a = await account(),
        b = await account();
    const products = await Promise.all([product(2), product(2)]);
    for (const p of products) {
        await add(a, p.id);
        await add(b, p.id);
    }
    const aa = await input(a),
        bb = await input(b);
    bb.items.reverse();
    const results = await Promise.all([
        a.agent.post("/api/checkout").send(aa),
        b.agent.post("/api/checkout").send(bb),
    ]);
    assert.deepEqual(
        results.map((r) => r.status),
        [201, 201],
    );
    for (const p of products)
        assert.equal(
            (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
            0,
        );
});

test("purchase and admin stock-out compete safely for last unit", async () => {
    const admin = await account(true),
        a = await account(),
        p = await product(1);
    await add(a, p.id);
    const body = await input(a);
    const results = await Promise.all([
        a.agent.post("/api/checkout").send(body),
        admin.agent
            .post(`/api/admin/products/${p.id}/stock-movements`)
            .send({ type: "OUT", quantity: 1, reason: "Damaged" }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
        0,
    );
    assert.equal(
        await db.stockMovement.count({ where: { productId: p.id } }),
        1,
    );
});

test("order or audit insertion failure restores stock, cart, orders and logs", async () => {
    for (const table of [
        "tbl_order",
        "tbl_order_item",
        "tbl_stock_movement",
        "tbl_product_log",
    ]) {
        const a = await account(),
            p = await product();
        await add(a, p.id);
        const body = await input(a);
        await setup.query(
            `CREATE FUNCTION reject_commerce_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated persistence failure'; END; $$; CREATE TRIGGER reject_insert BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_commerce_insert();`,
        );
        try {
            await a.agent.post("/api/checkout").send(body).expect(500);
            assert.equal(
                (await db.product.findUniqueOrThrow({ where: { id: p.id } }))
                    .stock,
                5,
            );
            assert.equal(
                (await db.product.findUniqueOrThrow({ where: { id: p.id } }))
                    .stockVersion,
                0,
            );
            assert.equal(await db.order.count({ where: { userId: a.id } }), 0);
            assert.equal(
                await db.stockMovement.count({ where: { actorId: a.id } }),
                0,
            );
            assert.equal(
                await db.productLog.count({ where: { actorId: a.id } }),
                0,
            );
            assert.equal((await cart(a)).version, body.version);
            assert.equal((await cart(a)).items.length, 1);
        } finally {
            await setup.query(
                `DROP TRIGGER reject_insert ON ${table}; DROP FUNCTION reject_commerce_insert();`,
            );
        }
        await a.agent.post("/api/checkout").send(body).expect(201);
    }
});

test("checkout rejects forged lines, duplicate products, changed cart, prices and total overflow", async () => {
    const a = await account(),
        p = await product(100, 10000000),
        q = await product(100, 10000000);
    await add(a, p.id, 100);
    await add(a, q.id, 100);
    const body = await input(a);
    await a.agent
        .post("/api/checkout")
        .send({ ...body, items: [body.items[0], body.items[0]] })
        .expect(400);
    await a.agent
        .post("/api/checkout")
        .send({
            ...body,
            items: [{ ...body.items[0], productId: randomUUID() }],
        })
        .expect(409);
    await a.agent
        .post("/api/checkout")
        .send({ ...body, items: [{ ...body.items[0], quantity: 99 }] })
        .expect(409);
    await a.agent
        .post("/api/checkout")
        .send({ ...body, items: [{ ...body.items[0], priceCents: 1 }] })
        .expect(409);
    await a.agent.post("/api/checkout").send(body).expect(400);
    assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
        100,
    );
    await a.agent
        .patch(`/api/cart/items/${p.id}`)
        .send({ version: body.version, quantity: 1 })
        .expect(200);
    await a.agent.post("/api/checkout").send(body).expect(409);
});

test("cart update racing checkout cannot be lost or clear unpurchased quantities", async () => {
    const a = await account(),
        p = await product(10);
    await add(a, p.id);
    const body = await input(a);
    const [purchase, edit] = await Promise.all([
        a.agent.post("/api/checkout").send(body),
        a.agent
            .patch(`/api/cart/items/${p.id}`)
            .send({ quantity: 2, version: body.version }),
    ]);
    if (purchase.status === 201) {
        assert.equal(edit.status, 409);
        assert.equal((await cart(a)).items.length, 0);
        assert.equal(
            (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
            9,
        );
    } else {
        assert.equal(purchase.status, 409);
        assert.equal(edit.status, 200);
        assert.equal((await cart(a)).items[0].quantity, 2);
        assert.equal(
            (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
            10,
        );
    }
});

test("concurrent stock-in and purchase preserve the combined stock delta", async () => {
    const admin = await account(true),
        a = await account(),
        p = await product(5);
    await add(a, p.id, 2);
    const body = await input(a);
    const results = await Promise.all([
        a.agent.post("/api/checkout").send(body),
        admin.agent
            .post(`/api/admin/products/${p.id}/stock-movements`)
            .send({ type: "IN", quantity: 3, reason: "Restocked" }),
    ]);
    assert.deepEqual(
        results.map((r) => r.status),
        [201, 201],
    );
    const after = await db.product.findUniqueOrThrow({ where: { id: p.id } });
    assert.equal(after.stock, 6);
    assert.equal(after.stockVersion, 2);
    assert.equal(
        await db.stockMovement.count({ where: { productId: p.id } }),
        2,
    );
});

test("order history is paginated deterministically and database stock constraints remain active", async () => {
    const a = await account(),
        p = await product();
    const orders = await Promise.all(
        Array.from({ length: 21 }, (_, i) =>
            db.order.create({
                data: {
                    userId: a.id,
                    totalAmountCents: 1200,
                    createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
                    items: {
                        create: {
                            productId: p.id,
                            productName: p.name,
                            quantity: 1,
                            unitPriceCents: 1200,
                        },
                    },
                },
            }),
        ),
    );
    const first = (await a.agent.get("/api/orders?page=1").expect(200)).body
        .data;
    const second = (await a.agent.get("/api/orders?page=2").expect(200)).body
        .data;
    assert.equal(first.total, 21);
    assert.equal(first.items.length, 20);
    assert.equal(second.items.length, 1);
    assert.equal(first.items[0].id, orders[20].id);
    assert.equal(second.items[0].id, orders[0].id);
    await a.agent.get("/api/orders?page=0").expect(400);
    await assert.rejects(
        setup.query("UPDATE tbl_product SET stock = -1 WHERE id = $1", [p.id]),
    );
    assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
        5,
    );
});
