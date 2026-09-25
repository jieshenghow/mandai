"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, money, time } from "@/lib/products";
import type { Order, OrderPage } from "@/lib/commerce";
import { Feedback } from "./product-ui";
import { freshQueries } from "./storefront";
export function OrdersScreen() {
    const [page, setPage] = useState(1);
    const query = useQuery({
        queryKey: ["orders", page],
        queryFn: () => api<OrderPage>(`/api/orders?page=${page}`),
        ...freshQueries,
    });
    return (
        <>
            <h1 className="text-3xl font-semibold">Your orders</h1>
            <p className="mb-8 mt-3 text-text-subtle">
                A record of your purchases.
            </p>
            <Feedback error={query.error} />
            {query.isPending && <p role="status">Loading orders…</p>}
            {query.data?.total === 0 && (
                <p className="rounded-xl border border-border p-10 text-center text-text-subtle">
                    No orders yet.{" "}
                    <Link href="/" className="text-accent-hover">
                        Explore the collection →
                    </Link>
                </p>
            )}
            <div className="space-y-4">
                {query.data?.items.map((order) => (
                    <Link
                        href={`/orders/${order.id}`}
                        key={order.id}
                        className="block rounded-xl border border-border bg-surface-1 p-5 hover:bg-surface-2"
                    >
                        <div className="flex flex-wrap justify-between gap-3">
                            <span className="font-semibold">
                                Order #{order.id.slice(0, 8)}
                            </span>
                            <strong>{money(order.totalAmountCents)}</strong>
                        </div>
                        <p className="mt-2 text-sm text-text-subtle">
                            {time(order.createdAt)} ·{" "}
                            {order.items.reduce((n, i) => n + i.quantity, 0)}{" "}
                            items
                        </p>
                        <p className="mt-3 truncate text-text-muted">
                            {order.items
                                .map((i) => `${i.productName} × ${i.quantity}`)
                                .join(", ")}
                        </p>
                    </Link>
                ))}
            </div>
            {!!query.data?.total && (
                <div className="mt-6 flex items-center justify-between">
                    <span className="text-text-subtle">
                        Page {page} · {query.data.total} orders
                    </span>
                    <div className="flex gap-2">
                        <button
                            className="btn"
                            disabled={page === 1}
                            onClick={() => setPage(page - 1)}
                        >
                            Previous
                        </button>
                        <button
                            className="btn"
                            disabled={page * 20 >= query.data.total}
                            onClick={() => setPage(page + 1)}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
export function OrderDetails({ id }: { id: string }) {
    const query = useQuery({
        queryKey: ["orders", id],
        queryFn: () => api<Order>(`/api/orders/${id}`),
        ...freshQueries,
    });
    const order = query.data;
    return (
        <>
            <Link href="/orders" className="text-text-subtle">
                ← All orders
            </Link>
            <Feedback error={query.error} />
            {query.isPending && (
                <p role="status" className="mt-6">
                    Loading order…
                </p>
            )}
            {order && (
                <section className="mt-8 rounded-xl border border-border bg-surface-1 p-6 sm:p-8">
                    <p className="text-sm text-emerald-300">Order confirmed</p>
                    <h1 className="mt-3 text-3xl font-semibold">
                        Thank you for your order.
                    </h1>
                    <p className="mt-4 break-all text-sm text-text-subtle">
                        Order {order.id}
                    </p>
                    <p className="mt-1 text-sm text-text-subtle">
                        {time(order.createdAt)}
                    </p>
                    <div className="mt-8 divide-y divide-border">
                        {order.items.map((i) => (
                            <div
                                key={i.id}
                                className="flex justify-between gap-4 py-5"
                            >
                                <div>
                                    <h2 className="font-medium">
                                        {i.productName}
                                    </h2>
                                    <p className="mt-1 text-sm text-text-subtle">
                                        {i.quantity} × {money(i.unitPriceCents)}
                                    </p>
                                </div>
                                <span>
                                    {money(i.quantity * i.unitPriceCents)}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between border-t border-border pt-6 text-lg font-semibold">
                        <span>Total</span>
                        <span>{money(order.totalAmountCents)}</span>
                    </div>
                    <p className="mt-5 text-sm text-text-subtle">
                        Your purchase is complete. No payment was collected for
                        this demo.
                    </p>
                    <Link href="/" className="btn mt-6">
                        Continue shopping
                    </Link>
                </section>
            )}
        </>
    );
}
