import {test} from "node:test";
import assert from "node:assert/strict";
import {checkoutItems, cartBlocksCheckout, type Cart, type CartItem} from "@/lib/commerce";
const item: CartItem = {productId: "first", name: "Mug", quantity: 2, priceCents: 100, stock: 3, available: true, archived: false, unavailableReason: null, imageUrl: null};
const cart = (items: CartItem[]): Cart => ({userId: "customer", version: 1, items, totalAmountCents: 200});
test("checkout keeps every line and blocks the whole cart for unavailable stock or archival", () => {
    assert.equal(cartBlocksCheckout(cart([])), true);
    assert.equal(cartBlocksCheckout(cart([item])), false);
    for (const change of [{stock: 0, available: false}, {stock: 1, available: false}, {archived: true, available: false}]) {
        const current = cart([item, {...item, productId: "second", ...change}]);
        assert.equal(cartBlocksCheckout(current), true);
        assert.deepEqual(checkoutItems(current), [
            {productId: "first", quantity: 2, priceCents: 100},
            {productId: "second", quantity: 2, priceCents: 100},
        ]);
    }
});
