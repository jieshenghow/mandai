import {test} from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {proxy} from "@/proxy";

test("proxy checks identity, redirects before rendering, and fails closed", async (context) => {
    let calls = 0;
    let status = 200;
    let role = "USER";
    let unavailable = false;
    context.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
        calls++;
        assert.equal(options.cache, "no-store");
        assert.equal((options.headers as Record<string, string>).Cookie, "session=sample");
        if (unavailable) throw new Error("Connection refused");
        return new Response(JSON.stringify({data: {role}}), {status});
    });
    const visit = (path: string, cookie = true) => proxy(new NextRequest(`http://localhost:3000${path}`, {headers: cookie ? {Cookie: "session=sample"} : {}}));
    assert.equal((await visit("/", false)).status, 200);
    assert.equal((await visit("/products/123", false)).status, 200);
    assert.equal((await visit("/cart", false)).headers.get("location"), "http://localhost:3000/login");
    assert.equal((await visit("/login", false)).status, 200);
    assert.equal(calls, 0);
    assert.equal((await visit("/admin")).headers.get("location"), "http://localhost:3000/");
    assert.equal((await visit("/register")).headers.get("location"), "http://localhost:3000/");
    role = "ADMIN";
    assert.equal((await visit("/admin")).status, 200);
    assert.equal((await visit("/login")).headers.get("location"), "http://localhost:3000/admin");
    status = 401;
    const expired = await visit("/admin");
    assert.equal(expired.headers.get("location"), "http://localhost:3000/login");
    assert.ok(expired.headers.get("set-cookie")?.includes("Max-Age=0"));
    status = 500;
    assert.equal((await visit("/")).status, 503);
    unavailable = true;
    assert.equal((await visit("/admin")).status, 503);
});
