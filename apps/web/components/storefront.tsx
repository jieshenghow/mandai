"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, money } from "@/lib/products";
import { cartKey, type Cart, type StoreProduct } from "@/lib/commerce";
import { useAccount } from "./workspace";
import { Feedback, Status } from "./product-ui";

export const freshQueries = {
    staleTime: 0,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: "always" as const,
};
export function ProductPicture({
    url,
    name,
    large = false,
}: {
    url?: string | null;
    name: string;
    large?: boolean;
}) {
    return (
        <div
            className={`relative grid place-items-center overflow-hidden rounded-lg bg-surface-2 ${large ? "aspect-square" : "aspect-[4/3]"}`}
        >
            {url ? (
                <Image
                    src={url}
                    alt={name}
                    fill
                    unoptimized
                    sizes={
                        large
                            ? "(max-width: 640px) 100vw, 480px"
                            : "(max-width: 640px) 100vw, 320px"
                    }
                    className="object-cover"
                />
            ) : (
                <span className="text-sm text-text-subtle">
                    No image available
                </span>
            )}
        </div>
    );
}
export function AddToCart({ product }: { product: StoreProduct }) {
    const account = useAccount();
    const [quantity, setQuantity] = useState(1);
    const [added, setAdded] = useState(false);
    const client = useQueryClient();
    const mutation = useMutation({
        mutationFn: async () => {
            const cart = await api<Cart>("/api/cart");
            return api<Cart>("/api/cart/items", "POST", {
                productId: product.id,
                quantity,
                version: cart.version,
            });
        },
        onMutate: () => setAdded(false),
        onSuccess: (cart) => {
            client.setQueryData(cartKey, cart);
            setAdded(true);
        },
        onSettled: async () => {
            await client.invalidateQueries({ queryKey: ["store-products"] });
        },
    });
    if (account.status === "loading") return <p className="mt-5 text-text-subtle">Loading account…</p>;
    if (account.status === "guest") return <Link href="/login" className="btn mt-5">Sign in to shop</Link>;
    if (account.status === "error") return <p className="mt-5 text-text-subtle">Account unavailable. Use Retry account above to shop.</p>;
    if (account.user.role !== "USER") return <p className="mt-5 text-text-subtle">Administrator account · browsing only</p>;
    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate();
            }}
            className="mt-5"
        >
            <div className="flex items-end gap-3">
                <label className="w-22 shrink-0">
                    <span className="field-label">Quantity</span>
                    <input
                        aria-label={`Quantity for ${product.name}`}
                        className="field"
                        type="number"
                        min={1}
                        max={Math.min(100, product.stock)}
                        value={quantity}
                        disabled={!product.stock || mutation.isPending}
                        onChange={(e) => {
                            setQuantity(Number(e.target.value));
                            setAdded(false);
                        }}
                        required
                    />
                </label>
                <button
                    className="btn btn-primary flex-1"
                    disabled={
                        mutation.isPending ||
                        !product.stock ||
                        quantity < 1 ||
                        quantity > Math.min(100, product.stock)
                    }
                >
                    {mutation.isPending
                        ? "Adding…"
                        : product.stock
                          ? "Add to cart"
                          : "Sold out"}
                </button>
            </div>
            <Feedback error={mutation.error} />
            {added && (
                <p role="status" className="mt-3 text-sm text-success">
                    Added to cart.{" "}
                    <Link href="/cart" className="underline">
                        View cart →
                    </Link>
                </p>
            )}
        </form>
    );
}
export function Storefront() {
    const [search, setSearch] = useState("");
    const query = useQuery({
        queryKey: ["store-products"],
        queryFn: () => api<StoreProduct[]>("/api/products"),
        ...freshQueries,
    });
    const products = query.data?.filter((p) =>
        `${p.name} ${p.description}`
            .toLowerCase()
            .includes(search.toLowerCase()),
    );
    return (
        <>
            <p className="mb-3 text-xs tracking-widest text-accent-hover">
                THE MANDAI COLLECTION
            </p>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">
                        A little something to keep.
                    </h1>
                    <p className="mt-3 text-text-subtle">
                        Explore the collection and find your next favourite.
                    </p>
                </div>
                <label>
                    <span className="sr-only">Search products</span>
                    <input
                        className="field sm:w-64"
                        type="search"
                        placeholder="Search products…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </label>
            </div>
            <Feedback error={query.error} />
            {query.isPending && <p role="status">Loading products…</p>}
            {products?.length === 0 && (
                <p className="rounded-xl border border-border p-10 text-center text-text-subtle">
                    {search
                        ? "No products match your search."
                        : "The collection is coming soon. Check back later."}
                </p>
            )}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {products?.map((p) => (
                    <article
                        key={p.id}
                        className="rounded-xl border border-border bg-surface-1 p-4"
                    >
                        <Link href={`/products/${p.id}`}>
                            <ProductPicture
                                url={
                                    (
                                        p.images.find(
                                            (i) => i.id === p.coverImageId,
                                        ) ?? p.images[0]
                                    )?.url
                                }
                                name={p.name}
                            />
                            <h2 className="mt-5 text-lg font-semibold">
                                {p.name}
                            </h2>
                        </Link>
                        <div className="mt-3 flex items-center justify-between gap-2">
                            <span className="text-lg">
                                {money(p.priceCents)}
                            </span>
                            <Status stock={p.stock} />
                        </div>
                        <p className="mt-3 text-sm text-text-subtle">
                            {p.stock} available
                        </p>
                        <AddToCart product={p} />
                    </article>
                ))}
            </div>
        </>
    );
}
export function ProductDetails({ id }: { id: string }) {
    const query = useQuery({
        queryKey: ["store-products", id],
        queryFn: () => api<StoreProduct>(`/api/products/${id}`),
        ...freshQueries,
    });
    const p = query.data;
    return (
        <>
            <Link href="/" className="text-text-subtle">
                ← Back to collection
            </Link>
            <Feedback error={query.error} />
            {query.isPending && (
                <p role="status" className="mt-6">
                    Loading product…
                </p>
            )}
            {p && (
                <div className="mt-8 grid gap-10 sm:grid-cols-2">
                    <div>
                        <ProductPicture
                            large
                            name={p.name}
                            url={
                                (
                                    p.images.find(
                                        (i) => i.id === p.coverImageId,
                                    ) ?? p.images[0]
                                )?.url
                            }
                        />
                        {p.images.length > 1 && (
                            <div className="mt-3 grid grid-cols-2 gap-3">
                                {p.images
                                    .filter(
                                        (i) =>
                                            i.id !==
                                            (p.coverImageId ?? p.images[0]?.id),
                                    )
                                    .map((i) => (
                                        <ProductPicture
                                            key={i.id}
                                            url={i.url}
                                            name={p.name}
                                        />
                                    ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <Status stock={p.stock} />
                        <h1 className="mt-5 text-3xl font-semibold">
                            {p.name}
                        </h1>
                        <p className="mt-4 text-2xl">{money(p.priceCents)}</p>
                        <p className="mt-6 whitespace-pre-wrap text-text-muted">
                            {p.description ||
                                "Discover a little piece of Mandai."}
                        </p>
                        <p className="mt-6 text-text-subtle">
                            {p.stock} available · Stock is confirmed at
                            checkout.
                        </p>
                        <AddToCart product={p} />
                    </div>
                </div>
            )}
        </>
    );
}
