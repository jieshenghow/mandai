import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm, access, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import request from "supertest";
import sharp from "sharp";

const sourceUrl = new URL(process.env.DATABASE_URL!);
const databaseName = `mandai_products_test_${process.pid}_${Date.now()}`;
const control = new pg.Client({ connectionString: sourceUrl.toString() });
await control.connect();
await control.query(`CREATE DATABASE "${databaseName}"`);
sourceUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = sourceUrl.toString();
process.env.UPLOAD_DIR = await mkdtemp(join(tmpdir(), "mandai-images-"));
const setup = new pg.Client({ connectionString: sourceUrl.toString() });
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
const { cleanupImages } = await import("../src/products.ts");
const { seedProducts } = await import("../src/seed-products.ts");
after(async () => {
    await db.$disconnect();
    await setup.end();
    await control.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await control.end();
    await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
});
async function account(email: string, admin = false) {
    const agent = request.agent(app);
    const response = await agent
        .post("/api/auth/register")
        .send({ email, password: "Password123!" })
        .expect(201);
    if (admin)
        await db.user.update({
            where: { id: response.body.data.id },
            data: { role: "ADMIN" },
        });
    return { agent, user: response.body.data };
}
const admin = await account("admin@example.com", true);
const member = await account("member@example.com");
const other = await account("other@example.com", true);
const base = {
    name: "Safari mug",
    description: "Ceramic",
    priceCents: 1200,
    stock: 1,
};
const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "green" },
})
    .png()
    .toBuffer();
async function upload(agent = admin.agent) {
    return (
        await agent
            .post("/api/admin/product-images")
            .attach("image", png, "mug.png")
            .expect(201)
    ).body.data;
}
async function create(extra = {}) {
    return (
        await admin.agent
            .post("/api/admin/products")
            .send({ ...base, ...extra })
            .expect(201)
    ).body.data;
}

test("product CRUD, authorization, immutable actor, field diffs, no-op and archive history", async () => {
    await request(app).get("/api/admin/products").expect(401);
    await member.agent.post("/api/admin/products").send(base).expect(403);
    await member.agent.get("/api/admin/product-logs").expect(403);
    for (const extra of [
        { stock: -1 },
        { priceCents: 1.2 },
        { name: " " },
        { actorId: member.user.id },
    ])
        await admin.agent
            .post("/api/admin/products")
            .send({ ...base, ...extra })
            .expect(400);
    const p = await create();
    await admin.agent.get("/api/admin/products/not-a-uuid").expect(400);
    const publicRead = await member.agent
        .get(`/api/products/${p.id}`)
        .expect(200);
    assert.equal(publicRead.body.data.stockVersion, undefined);
    await admin.agent
        .patch(`/api/admin/products/${p.id}`)
        .send({ stock: 100 })
        .expect(400);
    await admin.agent
        .patch(`/api/admin/products/${p.id}`)
        .send({ name: "Updated mug", priceCents: 1500 })
        .expect(200);
    await admin.agent
        .patch(`/api/admin/products/${p.id}`)
        .send({ name: "Updated mug", priceCents: 1500 })
        .expect(200);
    const logs = await admin.agent
        .get(`/api/admin/product-logs?productId=${p.id}`)
        .expect(200);
    assert.equal(logs.body.data.total, 2);
    assert.equal(logs.body.data.items[0].actorId, admin.user.id);
    assert.deepEqual(logs.body.data.items[0].changes.name, {
        before: "Safari mug",
        after: "Updated mug",
    });
    assert.deepEqual(logs.body.data.items[0].changes.priceCents, {
        before: 1200,
        after: 1500,
    });
    assert.equal(logs.body.data.items[0].changes.stock, undefined);
    await admin.agent.delete(`/api/admin/products/${p.id}`).expect(200);
    await admin.agent.get(`/api/admin/products/${p.id}`).expect(404);
    await member.agent.get(`/api/products/${p.id}`).expect(404);
    const list = await admin.agent.get("/api/admin/products").expect(200);
    assert.ok(!list.body.data.some((row: { id: string }) => row.id === p.id));
    const archived = await admin.agent
        .get(`/api/admin/product-logs?productId=${p.id}&action=ARCHIVE`)
        .expect(200);
    assert.equal(archived.body.data.total, 1);
    assert.equal(
        archived.body.data.items[0].changes.snapshot.name,
        "Updated mug",
    );
    const history = await admin.agent
        .get(`/api/admin/products/${p.id}/stock-movements`)
        .expect(200);
    assert.equal(history.body.data.length, 1);
    await admin.agent
        .patch(`/api/admin/product-logs/${archived.body.data.items[0].id}`)
        .send({ actorId: member.user.id })
        .expect(404);
});

test("images: decoding, limits, ownership, cover/order, removal and temporary cleanup", async () => {
    await member.agent
        .post("/api/admin/product-images")
        .attach("image", png, "mug.png")
        .expect(403);
    await admin.agent
        .post("/api/admin/product-images")
        .attach("image", Buffer.from("<script>bad</script>"), "fake.png")
        .expect(400);
    await admin.agent
        .post("/api/admin/product-images")
        .attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), "large.png")
        .expect(400);
    const first = await upload(),
        second = await upload();
    await request(app).get(first.url).expect(401);
    await other.agent.get(first.url).expect(404);
    await admin.agent.get(first.url).expect(200).expect("Content-Type", /webp/);
    await other.agent
        .post("/api/admin/products")
        .send({ ...base, imageIds: [first.id] })
        .expect(400);
    const p = await create({
        imageIds: [first.id, second.id],
        coverImageId: second.id,
    });
    assert.equal(p.coverImageId, second.id);
    await member.agent.get(first.url).expect(200);
    await request(app).get(first.url).expect(200).expect("Content-Type", /webp/);
    await admin.agent
        .post("/api/admin/products")
        .send({ ...base, imageIds: [first.id] })
        .expect(400);
    await admin.agent
        .patch(`/api/admin/products/${p.id}`)
        .send({ imageIds: [first.id, first.id] })
        .expect(400);
    await admin.agent
        .patch(`/api/admin/products/${p.id}`)
        .send({ imageIds: Array(9).fill(first.id) })
        .expect(400);
    await admin.agent
        .patch(`/api/admin/products/${p.id}`)
        .send({ imageIds: [first.id], coverImageId: second.id })
        .expect(400);
    const reordered = await admin.agent
        .patch(`/api/admin/products/${p.id}`)
        .send({ imageIds: [second.id, first.id], coverImageId: first.id })
        .expect(200);
    assert.deepEqual(
        reordered.body.data.images.map((i: { id: string }) => i.id),
        [second.id, first.id],
    );
    const removed = await admin.agent
        .patch(`/api/admin/products/${p.id}`)
        .send({ imageIds: [second.id] })
        .expect(200);
    assert.equal(removed.body.data.coverImageId, second.id);
    await request(app).get(first.url).expect(401);
    await member.agent.get(first.url).expect(404);
    const image = await db.productImage.update({
        where: { id: first.id },
        data: { createdAt: new Date(Date.now() - 25 * 3600000) },
    });
    await cleanupImages();
    assert.equal(
        await db.productImage.findUnique({ where: { id: first.id } }),
        null,
    );
    await assert.rejects(access(join(process.env.UPLOAD_DIR!, image.filename)));
    assert.ok(await db.productImage.findUnique({ where: { id: second.id } }));
    await admin.agent
        .patch(`/api/admin/products/${p.id}`)
        .send({ imageIds: [], coverImageId: null })
        .expect(200);
});

test("concurrent stock out: one success, no negative stock, matching movement and log", async () => {
    const p = await create();
    const path = `/api/admin/products/${p.id}/stock-movements`;
    const input = { type: "OUT", quantity: 1, reason: "Damaged" };
    const responses = await Promise.all([
        admin.agent.post(path).send(input),
        other.agent.post(path).send(input),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    const stored = await db.product.findUniqueOrThrow({ where: { id: p.id } });
    assert.equal(stored.stock, 0);
    assert.equal(stored.stockVersion, 1);
    assert.equal(
        await db.stockMovement.count({ where: { productId: p.id } }),
        2,
    );
    assert.equal(await db.productLog.count({ where: { productId: p.id } }), 2);
    const out = await db.productLog.findFirstOrThrow({
        where: { productId: p.id, action: "STOCK_OUT" },
    });
    assert.ok(out.movementId);
    await admin.agent
        .post(path)
        .send({ type: "IN", quantity: 3, reason: "Delivery" })
        .expect(201);
    for (const quantity of [0, -1, 0.5, 1000001])
        await admin.agent
            .post(path)
            .send({ type: "IN", quantity, reason: "Delivery" })
            .expect(400);
    await admin.agent
        .post(path)
        .send({ type: "IN", quantity: 1000000, reason: "Too much" })
        .expect(409);
    await admin.agent
        .post(path)
        .send({ type: "IN", quantity: 1, reason: " " })
        .expect(400);
});

test("audit failure rolls back product, stock and movement; pagination and filters", async () => {
    const p = await create();
    await setup.query(
        `CREATE FUNCTION reject_test_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$; CREATE TRIGGER reject_log BEFORE INSERT ON tbl_product_log FOR EACH ROW EXECUTE FUNCTION reject_test_log();`,
    );
    try {
        await admin.agent
            .patch(`/api/admin/products/${p.id}`)
            .send({ name: "Must roll back" })
            .expect(500);
        await admin.agent
            .post(`/api/admin/products/${p.id}/stock-movements`)
            .send({ type: "IN", quantity: 9, reason: "Must roll back" })
            .expect(500);
        assert.equal(
            (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
            1,
        );
        assert.equal(
            (await db.product.findUniqueOrThrow({ where: { id: p.id } })).name,
            base.name,
        );
        assert.equal(
            await db.stockMovement.count({ where: { productId: p.id } }),
            1,
        );
        assert.equal(
            await db.productLog.count({ where: { productId: p.id } }),
            1,
        );
    } finally {
        await setup.query(
            "DROP TRIGGER reject_log ON tbl_product_log; DROP FUNCTION reject_test_log();",
        );
    }
    for (let i = 0; i < 21; i++)
        await admin.agent
            .patch(`/api/admin/products/${p.id}`)
            .send({ description: `Edit ${i}` })
            .expect(200);
    const first = await admin.agent
        .get(
            `/api/admin/product-logs?productId=${p.id}&actor=admin%40example.com&action=UPDATE`,
        )
        .expect(200);
    assert.equal(first.body.data.total, 21);
    assert.equal(first.body.data.items.length, 20);
    const second = await admin.agent
        .get(`/api/admin/product-logs?productId=${p.id}&action=UPDATE&page=2`)
        .expect(200);
    assert.equal(second.body.data.items.length, 1);
    await admin.agent.get("/api/admin/product-logs?from=invalid").expect(400);
    const future = await admin.agent
        .get("/api/admin/product-logs?from=2100-01-01T00%3A00%3A00.000Z")
        .expect(200);
    assert.equal(future.body.data.total, 0);
});


test("guest catalog includes sold-out products, excludes archives and keeps private APIs private", async () => {
    const active = await create({stock: 0});
    const archived = await create();
    await admin.agent.delete(`/api/admin/products/${archived.id}`).expect(200);
    const list = (await request(app).get("/api/products").expect(200)).body.data;
    assert.ok(list.some((p: {id: string; stock: number}) => p.id === active.id && p.stock === 0));
    assert.ok(!list.some((p: {id: string}) => p.id === archived.id));
    await request(app).get(`/api/products/${active.id}`).expect(200);
    await request(app).get(`/api/products/${archived.id}`).expect(404);
    for (const path of ["/api/cart", "/api/orders", "/api/admin/products", "/api/admin/orders", "/api/admin/product-logs"])
        await request(app).get(path).expect(401);
    await request(app).post("/api/checkout").send({}).expect(401);
    await request(app).post("/api/admin/products").send(base).expect(401);
    const image = await upload();
    const pictured = await create({imageIds: [image.id]});
    await request(app).get(image.url).expect(200);
    await admin.agent.delete(`/api/admin/products/${pictured.id}`).expect(200);
    await request(app).get(image.url).expect(404);
    await admin.agent.patch(`/api/admin/products/${pictured.id}`).send({name: "Return"}).expect(404);
    await admin.agent.post(`/api/admin/products/${pictured.id}/stock-movements`).send({type: "IN", quantity: 1, reason: "Restock"}).expect(404);
});

test("demo product import preserves galleries, audit history and existing stock on concurrent reruns", async () => {
    const manifest = fileURLToPath(new URL("../../../test-products/products.json", import.meta.url));
    const fixtures = JSON.parse(await readFile(manifest, "utf8")) as {name: string; stock: number; priceCents: number; images: string[]}[];
    const before = await db.product.count();
    const results = await Promise.all([seedProducts(manifest), seedProducts(manifest)]);
    assert.equal(results.reduce((sum, r) => sum + r.created, 0), fixtures.length);
    assert.equal(results.reduce((sum, r) => sum + r.skipped, 0), fixtures.length);
    assert.equal(await db.product.count(), before + fixtures.length);
    const imported = await db.product.findMany({
        where: {name: {in: fixtures.map((p) => p.name)}},
        include: {images: {orderBy: {position: "asc"}}},
    });
    assert.equal(imported.length, fixtures.length);
    const ids = imported.map((p) => p.id);
    assert.equal(await db.productLog.count({where: {productId: {in: ids}, action: "CREATE"}}), fixtures.length);
    assert.equal(await db.stockMovement.count({where: {productId: {in: ids}}}), fixtures.filter((p) => p.stock > 0).length);
    for (const product of imported) {
        const fixture = fixtures.find((p) => p.name === product.name)!;
        assert.equal(product.priceCents, fixture.priceCents);
        assert.equal(product.stock, fixture.stock);
        assert.equal(product.images.length, fixture.images.length);
        assert.equal(product.coverImageId, product.images[0]?.id ?? null);
        for (const image of product.images) {
            assert.equal((await sharp(join(process.env.UPLOAD_DIR!, image.filename)).metadata()).format, "webp");
        }
    }
    await request(app).get(`/api/product-images/${imported[0].coverImageId}`).expect(200);
    await db.product.update({where: {id: imported[0].id}, data: {stock: 0, name: "Edited demo product", deletedAt: new Date()}});
    assert.deepEqual(await seedProducts(manifest), {created: 0, skipped: fixtures.length});
    const preserved = await db.product.findUniqueOrThrow({where: {id: imported[0].id}});
    assert.equal(preserved.stock, 0);
    assert.equal(preserved.name, "Edited demo product");
    assert.ok(preserved.deletedAt);
    assert.equal(await db.productLog.count({where: {productId: {in: ids}}}), fixtures.length);
});

test("demo import validates all inputs before writes and cleans files after transaction failure", async () => {
    const folder = await mkdtemp(join(tmpdir(), "mandai-seed-"));
    const manifest = join(folder, "products.json");
    const fixture = {key: "rollback-fixture", ...base, images: ["image.png"]};
    const count = await db.product.count();
    try {
        await writeFile(join(folder, "image.png"), png);
        await writeFile(manifest, JSON.stringify([fixture, {...fixture, key: "missing-image", images: ["missing.png"]}]));
        await assert.rejects(seedProducts(manifest), /ENOENT/);
        assert.equal(await db.product.count(), count);
        await writeFile(manifest, JSON.stringify([fixture, fixture]));
        await assert.rejects(seedProducts(manifest), /Product keys must be unique/);
        await writeFile(manifest, JSON.stringify([fixture]));
        const files = (await readdir(process.env.UPLOAD_DIR!)).sort();
        await setup.query(`CREATE FUNCTION seed_reject_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'seed audit failure'; END $$;
            CREATE TRIGGER seed_reject_log BEFORE INSERT ON tbl_product_log FOR EACH ROW EXECUTE FUNCTION seed_reject_log();`);
        try {
            await assert.rejects(seedProducts(manifest));
        } finally {
            await setup.query('DROP TRIGGER seed_reject_log ON tbl_product_log; DROP FUNCTION seed_reject_log();');
        }
        assert.equal(await db.product.count(), count);
        assert.deepEqual((await readdir(process.env.UPLOAD_DIR!)).sort(), files);
        assert.deepEqual(await seedProducts(manifest), {created: 1, skipped: 0});
    } finally {
        await rm(folder, {recursive: true, force: true});
    }
});
