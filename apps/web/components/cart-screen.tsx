"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, money } from "@/lib/products";
import {
    cartKey,
    checkoutItems,
    type Cart,
    type CartItem,
    type Checkout,
    type Order,
} from "@/lib/commerce";
import { Feedback } from "./product-ui";
import { freshQueries, ProductPicture } from "./storefront";

function CartRow({
    item,
    busy,
    update,
    remove,
    onDirty,
}: {
    item: CartItem;
    busy: boolean;
    update: (quantity: number) => void;
    remove: () => void;
    onDirty: (dirty: boolean) => void;
}) {
    const [quantity, setQuantity] = useState(String(item.quantity));
    return (
        <article
            className={`rounded-xl border p-5 ${item.available ? "border-border bg-surface-1" : "border-border-strong bg-surface-2"}`}
        >
            <div className="flex gap-4">
                <div
                    className={`w-24 shrink-0 ${item.available ? "" : "grayscale opacity-50"}`}
                >
                    <ProductPicture url={item.imageUrl} name={item.name} />
                </div>
                <div className="min-w-0 flex-1">
                    <h2
                        className={`text-lg font-semibold ${item.available ? "" : "text-text-subtle"}`}
                    >
                        {item.archived ? (
                            item.name
                        ) : (
                            <Link href={`/products/${item.productId}`}>
                                {item.name}
                            </Link>
                        )}
                    </h2>
                    <p className="mt-1 text-text-subtle">
                        {money(item.priceCents)} each · {item.stock} available
                    </p>
                    {!item.available && (
                        <p className="mt-2 text-sm text-text-muted">
                            {item.unavailableReason}{" "}
                            <strong>Excluded from checkout.</strong>
                        </p>
                    )}
                </div>
            </div>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                <form
                    className="flex items-end gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        update(Number(quantity));
                    }}
                >
                    <label className="w-22">
                        <span className="field-label">Quantity</span>
                        <input
                            className="field"
                            aria-label={`Quantity for ${item.name}`}
                            type="number"
                            min={1}
                            max={100}
                            required
                            value={quantity}
                            disabled={busy || item.archived}
                            onChange={(e) => {
                                setQuantity(e.target.value);
                                onDirty(
                                    Number(e.target.value) !== item.quantity,
                                );
                            }}
                        />
                    </label>
                    <button
                        className="btn"
                        disabled={
                            busy ||
                            item.archived ||
                            Number(quantity) === item.quantity
                        }
                    >
                        Update
                    </button>
                    <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={remove}
                    >
                        Remove
                    </button>
                </form>
                <span
                    className={
                        item.available
                            ? "font-medium"
                            : "text-text-subtle line-through"
                    }
                >
                    {money(item.priceCents * item.quantity)}
                </span>
            </div>
        </article>
    );
}
function readPending(key: string): Checkout | null {
    try {
        const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
        return value &&
            typeof value.requestId === "string" &&
            Number.isInteger(value.version) &&
            Array.isArray(value.items)
            ? value
            : null;
    } catch {
        return null;
    }
}
function LoadedCart({ cart }: { cart: Cart }) {
    const client = useQueryClient();
    const router = useRouter();
    const storageKey = `mandai-checkout:${cart.userId}`;
    const [edits, setEdits] = useState<{ version: number; ids: string[] }>({
        version: cart.version,
        ids: [],
    });
    const hasUnsavedEdits =
        edits.version === cart.version && edits.ids.length > 0;
    function dirtyItem(id: string, dirty: boolean) {
        setEdits((previous) => ({
            version: cart.version,
            ids: [
                ...(previous.version === cart.version
                    ? previous.ids
                    : []
                ).filter((value) => value !== id),
                ...(dirty ? [id] : []),
            ],
        }));
    }
    const [pendingRequest, setPendingRequest] = useState<Checkout | null>(() =>
        readPending(storageKey),
    );
    const edit = useMutation({
        mutationFn: ({ id, quantity }: { id: string; quantity?: number }) =>
            api<Cart>(
                `/api/cart/items/${id}`,
                quantity === undefined ? "DELETE" : "PATCH",
                {
                    version: cart.version,
                    ...(quantity === undefined ? {} : { quantity }),
                },
            ),
        onSuccess: (value) => client.setQueryData(cartKey, value),
        onError: async () => {
            await client.invalidateQueries({ queryKey: cartKey });
        },
    });
    function remember(value: Checkout | null) {
        setPendingRequest(value);
        try {
            if (value)
                sessionStorage.setItem(storageKey, JSON.stringify(value));
            else sessionStorage.removeItem(storageKey);
        } catch {
            /* In-memory protection still works when browser storage is unavailable. */
        }
    }
    const checkout = useMutation({
        mutationFn: (input: Checkout) =>
            api<Order>("/api/checkout", "POST", input),
        onSuccess: async (order) => {
            remember(null);
            await client.invalidateQueries();
            router.push(`/orders/${order.id}`);
        },
        onError: async (error) => {
            // A lost response may hide a committed order. Keep the exact request for a safe retry.
            if (
                error instanceof ApiError &&
                error.status >= 400 &&
                error.status < 500
            )
                remember(null);
            await client.invalidateQueries();
        },
    });
    const items = checkoutItems(cart);
    const busy = edit.isPending || checkout.isPending || checkout.isSuccess;
    const overLimit = cart.totalAmountCents > 1000000000;
    function submit() {
        const input = pendingRequest ?? {
            requestId: crypto.randomUUID(),
            version: cart.version,
            items,
        };
        remember(input);
        checkout.mutate(input);
    }
    return (
        <>
            <Feedback error={edit.error ?? checkout.error} />
            {pendingRequest && !checkout.isPending && (
                <p
                    role="status"
                    className="my-5 rounded-lg border border-border-strong p-4 text-text-muted"
                >
                    A previous checkout has not been confirmed. Use “Retry
                    checkout” to safely retrieve its result before changing your
                    cart.
                </p>
            )}
            {!cart.items.length && !pendingRequest ? (
                <div className="rounded-xl border border-border p-12 text-center">
                    <p className="text-text-subtle">Your cart is empty.</p>
                    <Link href="/" className="btn btn-primary mt-5">
                        Explore the collection
                    </Link>
                </div>
            ) : (
                <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
                    <div className="space-y-4">
                        {cart.items.map((item) => (
                            <CartRow
                                key={`${item.productId}:${cart.version}`}
                                item={item}
                                busy={busy || !!pendingRequest}
                                onDirty={(dirty) =>
                                    dirtyItem(item.productId, dirty)
                                }
                                update={(quantity) =>
                                    edit.mutate({
                                        id: item.productId,
                                        quantity,
                                    })
                                }
                                remove={() =>
                                    edit.mutate({ id: item.productId })
                                }
                            />
                        ))}
                    </div>
                    <aside className="rounded-xl border border-border bg-surface-1 p-6">
                        <h2 className="text-lg font-semibold">Order summary</h2>
                        <p className="mt-4 text-text-subtle">
                            {items.reduce((n, i) => n + i.quantity, 0)} items
                            ready to checkout
                        </p>
                        {cart.items.some((i) => !i.available) && (
                            <p className="mt-3 text-sm text-text-subtle">
                                Unavailable items stay in your cart and are
                                excluded from this order.
                            </p>
                        )}
                        <div className="my-6 flex justify-between border-t border-border pt-5">
                            <span>Total</span>
                            <strong>{money(cart.totalAmountCents)}</strong>
                        </div>
                        {overLimit && (
                            <p role="alert" className="mb-4 text-danger">
                                Order total exceeds the limit. Remove items or
                                reduce quantities.
                            </p>
                        )}
                        {hasUnsavedEdits && (
                            <p role="status" className="mb-4 text-text-muted">
                                Update your item quantities before checking out.
                            </p>
                        )}
                        <button
                            className="btn btn-primary w-full"
                            disabled={
                                busy ||
                                (!pendingRequest &&
                                    (!items.length ||
                                        overLimit ||
                                        hasUnsavedEdits))
                            }
                            onClick={submit}
                        >
                            {checkout.isPending
                                ? "Placing order…"
                                : checkout.isSuccess
                                  ? "Opening order…"
                                  : pendingRequest
                                    ? "Retry checkout"
                                    : "Checkout"}
                        </button>
                        <p className="mt-4 text-xs text-text-subtle">
                            No payment required for this demo. Stock is
                            confirmed when your order is placed.
                        </p>
                    </aside>
                </div>
            )}
        </>
    );
}
export function CartScreen() {
    const query = useQuery({
        queryKey: cartKey,
        queryFn: () => api<Cart>("/api/cart"),
        ...freshQueries,
    });
    return (
        <>
            <h1 className="text-3xl font-semibold">Your cart</h1>
            <p className="mb-8 mt-3 text-text-subtle">
                Review your items before placing an order.
            </p>
            <Feedback error={query.error} />
            {query.isPending && <p role="status">Loading cart…</p>}
            {query.data && (
                <LoadedCart key={query.data.userId} cart={query.data} />
            )}
        </>
    );
}
