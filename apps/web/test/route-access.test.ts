import {test} from "node:test";
import assert from "node:assert/strict";
import {redirectFor, routeGroup} from "@/lib/route-access";

test("every page group defaults to authenticated access", () => {
    for (const path of ["/", "/products/123", "/missing", "/adminish"]) {
        assert.equal(routeGroup(path), "app");
        assert.equal(redirectFor(path, null), "/login");
        for (const role of ["USER", "ADMIN"] as const)
            assert.equal(redirectFor(path, role), null);
    }
    for (const path of ["/login", "/register", "/login/"]) {
        assert.equal(redirectFor(path, null), null);
        assert.equal(redirectFor(path, "USER"), "/");
        assert.equal(redirectFor(path, "ADMIN"), "/admin");
    }
    for (const path of [
        "/admin",
        "/admin/",
        "/admin/products",
        "/admin/missing",
    ]) {
        assert.equal(redirectFor(path, null), "/login");
        assert.equal(redirectFor(path, "USER"), "/");
        assert.equal(redirectFor(path, "ADMIN"), null);
    }
});

