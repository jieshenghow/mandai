import {test} from "node:test";
import assert from "node:assert/strict";
import {redirectFor} from "@/lib/route-access";

test("public catalog and protected customer/admin pages", () => {
    for (const path of ["/", "/products/123", "/products/123/"])
        for (const role of [null, "USER", "ADMIN"] as const)
            assert.equal(redirectFor(path, role), null);
    for (const path of ["/cart", "/orders", "/orders/123"]) {
        assert.equal(redirectFor(path, null), "/login");
        assert.equal(redirectFor(path, "USER"), null);
        assert.equal(redirectFor(path, "ADMIN"), "/admin");
    }
    for (const path of ["/missing", "/adminish", "/products/123/private"])
        assert.equal(redirectFor(path, null), "/login");
    for (const path of ["/login", "/register", "/login/"]) {
        assert.equal(redirectFor(path, null), null);
        assert.equal(redirectFor(path, "USER"), "/");
        assert.equal(redirectFor(path, "ADMIN"), "/admin");
    }
    for (const path of ["/admin", "/admin/", "/admin/products", "/admin/orders", "/admin/orders/123"]) {
        assert.equal(redirectFor(path, null), "/login");
        assert.equal(redirectFor(path, "USER"), "/");
        assert.equal(redirectFor(path, "ADMIN"), null);
    }
});
