"use client";
/* eslint-disable @next/next/no-img-element -- Images use the authenticated Express endpoint. */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, money, time, type Product, type Movement } from "@/lib/products";
import { Feedback, Modal, ModalCancel, Status } from "./product-ui";
import { ProductForm } from "./product-form";
import { ProductLogs } from "./product-logs";

type Action = "view" | "edit" | "IN" | "OUT" | "delete";
export function ProductsScreen() {
    const queryClient = useQueryClient();
    const products = useQuery({
        queryKey: ["products"],
        queryFn: () => api<Product[]>("/api/admin/products"),
    });
    const [selection, setSelection] = useState<{
        id: string;
        action: Action;
    } | null>(null);
    const [creating, setCreating] = useState(false);
    const [message, setMessage] = useState("");
    function saved() {
        setSelection(null);
        setCreating(false);
        setMessage("Changes saved successfully.");
        for (const key of [
            "products",
            "product",
            "stock-movements",
            "product-logs",
        ])
            void queryClient.invalidateQueries({ queryKey: [key] });
    }
    const all = products.data ?? [];
    return (
        <>
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="mb-2 text-xs tracking-widest text-text-subtle">
                        INVENTORY
                    </p>
                    <h1 className="text-[28px] font-semibold">Products</h1>
                    <p className="mt-2 text-text-subtle">
                        Manage your catalog, stock and product changes.
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setCreating(true);
                        setMessage("");
                    }}
                >
                    + Add product
                </button>
            </div>
            <div className="mb-8 grid grid-cols-3 gap-3">
                {[
                    ["Products", all.length],
                    [
                        "Low stock",
                        all.filter((p) => p.stock > 0 && p.stock <= 5).length,
                    ],
                    ["Sold out", all.filter((p) => p.stock === 0).length],
                ].map(([label, count]) => (
                    <div
                        key={label}
                        className="rounded-xl border border-border bg-surface-1 p-4"
                    >
                        <p className="text-xs text-text-subtle">{label}</p>
                        <p className="mt-1 text-2xl font-semibold">
                            {products.isPending ? "—" : count}
                        </p>
                    </div>
                ))}
            </div>
            {message && (
                <p role="status" className="mb-4 text-sm text-emerald-300">
                    {message}
                </p>
            )}
            <Feedback error={products.error} />
            {products.isError && (
                <button className="btn" onClick={() => products.refetch()}>
                    Retry
                </button>
            )}
            {products.isPending ? (
                <p role="status">Loading products…</p>
            ) : products.data?.length === 0 ? (
                <div className="rounded-xl border border-border p-12 text-center">
                    <h2 className="text-xl font-semibold">
                        Your catalog starts here
                    </h2>
                    <p className="mt-2 text-text-subtle">
                        Add your first product with images and initial stock.
                    </p>
                    <button
                        className="btn btn-primary mt-5"
                        onClick={() => setCreating(true)}
                    >
                        Add product
                    </button>
                </div>
            ) : (
                products.data && (
                    <div className="overflow-x-auto rounded-xl border border-border bg-surface-1">
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th className="text-right">Price</th>
                                    <th className="text-right">Stock</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.data.map((p) => (
                                    <tr key={p.id}>
                                        <td>
                                            <div className="flex min-w-48 items-center gap-3">
                                                {p.coverImageId ? (
                                                    <img
                                                        src={`/api/product-images/${p.coverImageId}`}
                                                        alt=""
                                                        className="size-11 shrink-0 rounded-md object-cover"
                                                    />
                                                ) : (
                                                    <span
                                                        aria-label="No image"
                                                        className="grid size-11 shrink-0 place-items-center rounded-md border border-border text-text-subtle"
                                                    >
                                                        ▧
                                                    </span>
                                                )}
                                                <button
                                                    className="text-left font-medium hover:text-accent-hover"
                                                    onClick={() =>
                                                        setSelection({
                                                            id: p.id,
                                                            action: "view",
                                                        })
                                                    }
                                                >
                                                    {p.name}
                                                </button>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap text-right tabular-nums">
                                            {money(p.priceCents)}
                                        </td>
                                        <td className="text-right tabular-nums">
                                            {p.stock.toLocaleString()}
                                        </td>
                                        <td className="whitespace-nowrap">
                                            <Status stock={p.stock} />
                                        </td>
                                        <td>
                                            <div className="flex min-w-72 flex-wrap gap-2">
                                                {(
                                                    [
                                                        ["view", "View"],
                                                        ["edit", "Edit"],
                                                        ["IN", "Stock in"],
                                                        ["OUT", "Stock out"],
                                                        ["delete", "Delete"],
                                                    ] as const
                                                ).map(([action, label]) => (
                                                    <button
                                                        key={action}
                                                        className={`btn ${action === "delete" ? "btn-danger" : ""}`}
                                                        onClick={() => {
                                                            setSelection({
                                                                id: p.id,
                                                                action,
                                                            });
                                                            setMessage("");
                                                        }}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}
            {creating && (
                <ProductForm close={() => setCreating(false)} saved={saved} />
            )}
            {selection && (
                <SelectedProduct
                    key={`${selection.id}-${selection.action}`}
                    {...selection}
                    close={() => setSelection(null)}
                    saved={saved}
                />
            )}
        </>
    );
}
function SelectedProduct({
    id,
    action,
    close,
    saved,
}: {
    id: string;
    action: Action;
    close: () => void;
    saved: () => void;
}) {
    const query = useQuery({
        queryKey: ["product", id],
        queryFn: () => api<Product>(`/api/admin/products/${id}`),
        staleTime: 0,
        refetchOnWindowFocus: false,
    });
    if (query.isPending || query.isError)
        return (
            <Modal title="Product" close={close}>
                <Feedback error={query.error} />
                {query.isPending ? (
                    <p role="status">Loading product…</p>
                ) : (
                    <button className="btn" onClick={() => query.refetch()}>
                        Retry
                    </button>
                )}
            </Modal>
        );
    if (action === "edit")
        return <ProductForm product={query.data} close={close} saved={saved} />;
    if (action === "view")
        return <ProductDetail product={query.data} close={close} />;
    return (
        <StockOrDelete
            product={query.data}
            action={action}
            close={close}
            saved={saved}
        />
    );
}
function StockOrDelete({
    product,
    action,
    close,
    saved,
}: {
    product: Product;
    action: "IN" | "OUT" | "delete";
    close: () => void;
    saved: () => void;
}) {
    const client = useQueryClient();
    const [quantity, setQuantity] = useState("1");
    const [reason, setReason] = useState("");
    const title =
        action === "delete"
            ? "Delete product"
            : action === "IN"
              ? "Stock in"
              : "Stock out";
    const mutation = useMutation({
        mutationFn: () =>
            action === "delete"
                ? api(`/api/admin/products/${product.id}`, "DELETE")
                : api(
                      `/api/admin/products/${product.id}/stock-movements`,
                      "POST",
                      { type: action, quantity: Number(quantity), reason },
                  ),
        onSuccess: saved,
        onError: () => {
            void client.invalidateQueries({
                queryKey: ["product", product.id],
            });
            void client.invalidateQueries({ queryKey: ["products"] });
        },
    });
    function submit(e: FormEvent) {
        e.preventDefault();
        mutation.mutate();
    }
    return (
        <Modal
            title={title}
            close={close}
            busy={mutation.isPending}
            dirty={action !== "delete" && (!!reason || quantity !== "1")}
        >
            <p className="mb-5 font-medium">{product.name}</p>
            <form onSubmit={submit} className="space-y-5">
                <fieldset disabled={mutation.isPending} className="space-y-5">
                    {action === "delete" ? (
                        <p className="text-text-muted">
                            This product will be archived and removed from
                            active lists. Existing orders, stock history and
                            product logs will be preserved.
                        </p>
                    ) : (
                        <>
                            <p className="text-text-subtle">
                                Current stock:{" "}
                                <strong className="text-text">
                                    {product.stock}
                                </strong>
                            </p>
                            <label className="block">
                                <span className="field-label">Quantity *</span>
                                <input
                                    autoFocus
                                    className="field"
                                    type="number"
                                    required
                                    min={1}
                                    max={1000000}
                                    step={1}
                                    value={quantity}
                                    onChange={(e) =>
                                        setQuantity(e.target.value)
                                    }
                                />
                            </label>
                            <label className="block">
                                <span className="field-label">Reason *</span>
                                <textarea
                                    className="field"
                                    required
                                    maxLength={500}
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="e.g. Supplier delivery, damaged items"
                                />
                            </label>
                            <p className="text-xs text-text-subtle">
                                Actual stock is checked when you submit. This
                                adjustment will be recorded with your account.
                            </p>
                        </>
                    )}
                </fieldset>
                <Feedback error={mutation.error} />
                <div className="flex justify-end gap-3">
                    <ModalCancel disabled={mutation.isPending} />
                    <button
                        className={`btn ${action === "delete" ? "btn-danger" : "btn-primary"}`}
                        disabled={mutation.isPending}
                    >
                        {mutation.isPending ? "Saving…" : title}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
function ProductDetail({
    product,
    close,
}: {
    product: Product;
    close: () => void;
}) {
    const [tab, setTab] = useState("details");
    const movements = useQuery({
        queryKey: ["stock-movements", product.id],
        queryFn: () =>
            api<Movement[]>(
                `/api/admin/products/${product.id}/stock-movements`,
            ),
        enabled: tab === "stock",
    });
    return (
        <Modal title={product.name} close={close}>
            <div className="mb-6 flex flex-wrap gap-2">
                {[
                    ["details", "Details"],
                    ["stock", "Stock history"],
                    ["logs", "Product logs"],
                ].map(([id, label]) => (
                    <button
                        key={id}
                        className={`btn ${tab === id ? "btn-primary" : ""}`}
                        aria-pressed={tab === id}
                        onClick={() => setTab(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {tab === "details" && (
                <>
                    <div className="mb-5 flex flex-wrap items-center gap-4">
                        <strong className="text-2xl">
                            {money(product.priceCents)}
                        </strong>
                        <Status stock={product.stock} />
                        <span className="text-text-subtle">
                            {product.stock} units
                        </span>
                    </div>
                    <p className="mb-6 whitespace-pre-wrap text-text-muted">
                        {product.description || "No description."}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        {product.images.map((image) => (
                            <figure key={image.id}>
                                <img
                                    src={image.url}
                                    alt={product.name}
                                    className="aspect-square w-full rounded-lg border border-border object-contain"
                                />
                                {product.coverImageId === image.id && (
                                    <figcaption className="mt-1 text-xs text-accent-hover">
                                        Cover image
                                    </figcaption>
                                )}
                            </figure>
                        ))}
                    </div>
                    {!product.images.length && (
                        <p className="rounded-lg border border-border p-8 text-center text-text-subtle">
                            No images
                        </p>
                    )}
                </>
            )}
            {tab === "logs" && <ProductLogs productId={product.id} />}
            {tab === "stock" && (
                <>
                    <Feedback error={movements.error} />
                    {movements.isError && (
                        <button
                            className="btn"
                            onClick={() => movements.refetch()}
                        >
                            Retry
                        </button>
                    )}
                    {movements.isPending && (
                        <p role="status">Loading stock history…</p>
                    )}
                    {movements.data?.length === 0 && (
                        <p>No stock movements yet.</p>
                    )}
                    <div className="space-y-3">
                        {movements.data?.map((m) => (
                            <div
                                key={m.id}
                                className="rounded-lg border border-border p-4"
                            >
                                <div className="flex justify-between gap-3">
                                    <strong
                                        className={
                                            m.delta > 0
                                                ? "text-emerald-300"
                                                : "text-danger"
                                        }
                                    >
                                        {m.delta > 0 ? "+" : ""}
                                        {m.delta} units
                                    </strong>
                                    <span className="text-sm">
                                        Stock after: {m.stockAfter}
                                    </span>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-sm">
                                    {m.reason}
                                </p>
                                <p className="mt-2 break-all text-xs text-text-subtle">
                                    {m.actorEmail} · {time(m.createdAt)}
                                </p>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </Modal>
    );
}
