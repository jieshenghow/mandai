import {test} from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {IsRestoringProvider, QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {PathnameContext} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import {Workspace} from "@/components/workspace";
import {AddToCart} from "@/components/storefront";
import {loadAccount, type AccountState} from "@/lib/account";
import {readPendingCheckout, savePendingCheckout, submitCheckout} from "@/lib/checkout-recovery";
import type {Checkout} from "@/lib/commerce";

const user = {id: "original", email: "customer@example.test", role: "USER"};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status});
const body: Checkout = {requestId: "original-request", version: 7, items: [{productId: "mug", quantity: 2, priceCents: 300}]};

test("lost success, expired session, forbidden retry and same-user recovery retain the exact stored request", async (t) => {
    const storage = new Map<string, string>();
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "sessionStorage", {configurable: true, value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    }});
    t.after(() => {
        if (previousStorage) Object.defineProperty(globalThis, "sessionStorage", previousStorage);
        else Reflect.deleteProperty(globalThis, "sessionStorage");
    });
    const key = `mandai-checkout:${user.id}`;
    const remember = (value: Checkout | null) => savePendingCheckout(key, value);
    const sent: unknown[] = [];
    let mode = "lost";
    t.mock.method(globalThis, "fetch", async (path: RequestInfo | URL, init?: RequestInit) => {
        if (path === "/api/auth/me") {
            if (mode === "expired") return reply({}, 401);
            if (mode === "other") return reply({data: {...user, id: "other"}});
            if (mode === "admin") return reply({data: {...user, role: "ADMIN"}});
            if (mode === "outage") return reply({}, 503);
            return reply({data: user});
        }
        sent.push(JSON.parse(String(init?.body)));
        if (mode === "lost") throw new TypeError("Response lost after commit");
        if (mode === "forbidden") return reply({error: "FORBIDDEN"}, 403);
        if (mode === "expired-after-check") return reply({error: "UNAUTHORIZED"}, 401);
        return reply({data: {id: "original-order"}});
    });
    await assert.rejects(submitCheckout(user.id, body, remember), /Response lost/);
    for (mode of ["expired", "other", "admin", "outage", "forbidden", "expired-after-check"]) {
        const saved = readPendingCheckout(key)!;
        await assert.rejects(submitCheckout(user.id, saved, remember), /original customer account|Unable to load/);
        assert.deepEqual(readPendingCheckout(key), body);
    }
    assert.equal(sent.length, 3, "expired, other-user, admin and outage preflights must not post checkout");
    assert.equal(readPendingCheckout("mandai-checkout:other"), null);
    mode = "recovered";
    const order = await submitCheckout(user.id, readPendingCheckout(key)!, remember);
    assert.equal(order.id, "original-order");
    assert.equal(readPendingCheckout(key), null);
    assert.deepEqual(sent, Array.from({length: 4}, () => body));
});

test("only resolved checkout failures clear pending; server and unrelated client errors retain it", async (t) => {
    let pending: Checkout | null = null;
    let status = 500;
    t.mock.method(globalThis, "fetch", async (path: RequestInfo | URL) => path === "/api/auth/me"
        ? reply({data: user}) : reply({error: "FAILURE"}, status));
    for (status of [500, 404, 429, 400, 409]) {
        await assert.rejects(submitCheckout(user.id, body, (value) => {pending = value;}));
        assert.deepEqual(pending, [400, 409].includes(status) ? null : body);
    }
});

function renderAccount(account?: AccountState) {
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    if (account) client.setQueryData(["account"], account);
    const child = createElement(AddToCart, {product: {
        id: "mug", name: "Mug", description: "", stock: 5, priceCents: 300, images: [], coverImageId: null,
    }});
    const markup = renderToStaticMarkup(createElement(QueryClientProvider, {client},
        createElement(IsRestoringProvider, {value: true},
            createElement(PathnameContext.Provider, {value: "/"},
                createElement(Workspace, {}, child)))));
    client.clear();
    return markup;
}

test("account fetch outage is visible with children, and retry recovers customer controls", async (t) => {
    let mode = "outage";
    t.mock.method(globalThis, "fetch", async () => {
        if (mode === "network") throw new TypeError("offline");
        if (mode === "invalid") return reply({data: {}});
        if (mode === "guest") return reply({}, 401);
        if (mode === "admin") return reply({data: {...user, role: "ADMIN"}});
        return mode === "outage" ? reply({}, 503) : reply({data: user});
    });
    assert.match(renderAccount(), /Loading account/);
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const retry = () => client.fetchQuery({queryKey: ["account"], queryFn: () => loadAccount(), staleTime: 0});
    for (mode of ["outage", "network", "invalid"]) {
        const account = await retry();
        assert.equal(account.status, "error");
        const markup = renderAccount(account);
        assert.match(markup, /role="alert"/);
        assert.match(markup, /Retry account/);
        assert.match(markup, /Account unavailable/);
        assert.doesNotMatch(markup, /Loading account|Sign in to shop|Add to cart/);
    }
    mode = "customer";
    const recovered = await retry();
    assert.equal(recovered.status, "authenticated");
    assert.match(renderAccount(recovered), /Add to cart/);
    assert.doesNotMatch(renderAccount(recovered), /Retry account|Account unavailable/);
    mode = "guest";
    assert.match(renderAccount(await retry()), /Sign in to shop/);
    mode = "admin";
    const admin = renderAccount(await retry());
    assert.match(admin, /browsing only/);
    assert.doesNotMatch(admin, /Add to cart/);
    client.clear();
});
