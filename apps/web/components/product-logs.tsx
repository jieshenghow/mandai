"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, money, time, type LogPage } from "@/lib/products";
import { Feedback } from "./product-ui";
const actions: Record<string, string> = {
    CREATE: "Created",
    UPDATE: "Edited",
    ARCHIVE: "Deleted (archived)",
    STOCK_IN: "Stock in",
    STOCK_OUT: "Stock out",
};
const labels: Record<string, string> = {
    name: "Name",
    description: "Description",
    priceCents: "Price",
    stock: "Stock",
    imageIds: "Image order / membership",
    coverImageId: "Cover image",
    deletedAt: "Archived at",
    reason: "Reason",
    quantity: "Quantity",
    snapshot: "Product before deletion",
};
function display(field: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (field === "priceCents" && typeof value === "number")
        return money(value);
    return typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : String(value);
}
export function ProductLogs({ productId }: { productId?: string }) {
    const [filters, setFilters] = useState({
        product: "",
        actor: "",
        action: "",
        from: "",
        to: "",
    });
    const [page, setPage] = useState(1);
    const params = new URLSearchParams({ page: String(page) });
    if (productId) params.set("productId", productId);
    for (const key of ["product", "actor", "action"] as const)
        if (filters[key]) params.set(key, filters[key]);
    if (filters.from)
        params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
    if (filters.to)
        params.set("to", new Date(`${filters.to}T23:59:59.999`).toISOString());
    const query = useQuery({
        queryKey: ["product-logs", params.toString()],
        queryFn: () => api<LogPage>(`/api/admin/product-logs?${params}`),
    });
    function change(key: keyof typeof filters, value: string) {
        setFilters({ ...filters, [key]: value });
        setPage(1);
    }
    return (
        <section aria-label="Product change log">
            <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {!productId && (
                    <label>
                        <span className="field-label">Product name</span>
                        <input
                            className="field"
                            value={filters.product}
                            onChange={(e) => change("product", e.target.value)}
                            placeholder="Filter products"
                        />
                    </label>
                )}
                <label>
                    <span className="field-label">Operator email</span>
                    <input
                        className="field"
                        value={filters.actor}
                        onChange={(e) => change("actor", e.target.value)}
                        placeholder="Filter operators"
                    />
                </label>
                <label>
                    <span className="field-label">Action</span>
                    <select
                        className="field"
                        value={filters.action}
                        onChange={(e) => change("action", e.target.value)}
                    >
                        <option value="">All changes</option>
                        {Object.entries(actions).map(([key, label]) => (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <span className="field-label">From</span>
                    <input
                        className="field"
                        type="date"
                        value={filters.from}
                        onChange={(e) => change("from", e.target.value)}
                    />
                </label>
                <label>
                    <span className="field-label">Through</span>
                    <input
                        className="field"
                        type="date"
                        value={filters.to}
                        min={filters.from}
                        onChange={(e) => change("to", e.target.value)}
                    />
                </label>
            </div>
            <Feedback error={query.error} />
            {query.isError && (
                <button className="btn" onClick={() => query.refetch()}>
                    Retry
                </button>
            )}
            {query.isPending && <p role="status">Loading changes…</p>}
            {query.data?.items.length === 0 && (
                <p className="rounded-xl border border-border p-8 text-center text-text-subtle">
                    No product changes found.
                </p>
            )}
            <div className="space-y-3">
                {query.data?.items.map((log) => (
                    <details
                        key={log.id}
                        className="rounded-xl border border-border bg-surface-1 p-4"
                    >
                        <summary className="cursor-pointer text-sm">
                            <strong>{actions[log.action] ?? log.action}</strong>{" "}
                            · {log.productName}
                            <span className="mt-2 block break-all text-xs text-text-subtle">
                                {log.actorEmail} · {time(log.createdAt)}
                            </span>
                        </summary>
                        <p className="mt-4 text-xs text-text-subtle">
                            Product ID: {log.productId}
                        </p>
                        <div className="mt-3 overflow-x-auto">
                            <table className="inventory-table">
                                <thead>
                                    <tr>
                                        <th>Field</th>
                                        <th>Before</th>
                                        <th>After / details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(log.changes).map(
                                        ([field, value]) => {
                                            const isChange =
                                                value !== null &&
                                                typeof value === "object" &&
                                                "before" in value &&
                                                "after" in value;
                                            return (
                                                <tr key={field}>
                                                    <td>
                                                        {labels[field] ?? field}
                                                    </td>
                                                    <td className="max-w-64 whitespace-pre-wrap break-words">
                                                        {isChange
                                                            ? display(
                                                                  field,
                                                                  value.before,
                                                              )
                                                            : "—"}
                                                    </td>
                                                    <td className="max-w-80 whitespace-pre-wrap break-words">
                                                        {display(
                                                            field,
                                                            isChange
                                                                ? value.after
                                                                : value,
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        },
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </details>
                ))}
            </div>
            {query.data && (
                <div className="mt-5 flex items-center justify-between gap-3 text-sm">
                    <span className="text-text-subtle">
                        {query.data.total} changes · Page {page}
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
        </section>
    );
}
