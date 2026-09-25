import {test, after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import pg from "pg";
import request from "supertest";
import jwt from "jsonwebtoken";

const sourceUrl = new URL(process.env.DATABASE_URL!);
const databaseName = `mandai_auth_test_${process.pid}_${Date.now()}`;
const control = new pg.Client({connectionString: sourceUrl.toString()});
await control.connect();
await control.query(`CREATE DATABASE "${databaseName}"`);
sourceUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = sourceUrl.toString();
const setup = new pg.Client({connectionString: sourceUrl.toString()});
await setup.connect();
await setup.query(
    await readFile(
        new URL(
            "../../../prisma/migrations/20260925040959_init/migration.sql",
            import.meta.url,
        ),
        "utf8",
    ),
);
await setup.end();
const {default: app} = await import("../src/app.ts");
const {db} = await import("../src/db.ts");
after(async () => {
    await db.$disconnect();
    await control.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await control.end();
});

test("registration, sessions, roles, validation and logout", async () => {
    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/auth/me").expect(401);
    await request(app).get("/api/anything").expect(401);
    await request(app)
        .post("/api/auth/register")
        .send({email: "bad", password: "short"})
        .expect(400);
    await request(app)
        .post("/api/auth/register")
        .send({email: "test@example.com", password: "界".repeat(25)})
        .expect(400);
    await request(app)
        .post("/api/auth/register")
        .set("Content-Type", "application/json")
        .send("{")
        .expect(400);
    const agent = request.agent(app);
    const registration = await agent
        .post("/api/auth/register")
        .send({
            email: " Test@Example.com ",
            password: "Password123!",
            role: "ADMIN",
        })
        .expect(201);
    assert.equal(registration.body.data.role, "USER");
    assert.equal(registration.body.data.email, "test@example.com");
    assert.equal(registration.body.data.passwordHash, undefined);
    const cookie = registration.headers["set-cookie"][0];
    for (const flag of ["HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=3600"])
        assert.ok(cookie.includes(flag));
    const stored = await db.user.findUniqueOrThrow({
        where: {email: "test@example.com"},
    });
    assert.notEqual(stored.passwordHash, "Password123!");
    await agent.get("/api/auth/me").expect(200);
    await agent.get("/api/admin/missing").expect(403);
    await agent.get("/api/missing").expect(404);
    await request(app)
        .post("/api/auth/register")
        .send({email: "TEST@example.com", password: "Password123!"})
        .expect(409);
    await request(app)
        .post("/api/auth/login")
        .send({email: "test@example.com", password: "wrongpass"})
        .expect(401);
    await request(app)
        .post("/api/auth/login")
        .send({email: "absent@example.com", password: "Password123!"})
        .expect(401);
    const logout = await agent.post("/api/auth/logout").expect(200);
    assert.ok(logout.headers["set-cookie"][0].includes("Path=/"));
    await agent.get("/api/auth/me").expect(401);
    await agent
        .post("/api/auth/login")
        .send({email: "TEST@example.com", password: "Password123!"})
        .expect(200);
    await agent.get("/api/auth/me").expect(200);
    await request(app)
        .get("/api/auth/me")
        .set("Cookie", "session=tampered")
        .expect(401);
    const expired = jwt.sign({role: "USER"}, process.env.JWT_SECRET!, {
        subject: stored.id,
        expiresIn: -1,
    });
    await request(app)
        .get("/api/auth/me")
        .set("Cookie", `session=${expired}`)
        .expect(401);
    await db.user.update({where: {id: stored.id}, data: {role: "ADMIN"}});
    const admin = await agent.get("/api/auth/me").expect(200);
    assert.equal(admin.body.data.role, "ADMIN");
    // A missing admin endpoint returns 404 only after the role guard permits access.
    await agent.get("/api/admin/missing").expect(404);
    await db.user.delete({where: {id: stored.id}});
    await agent.get("/api/auth/me").expect(401);
});
