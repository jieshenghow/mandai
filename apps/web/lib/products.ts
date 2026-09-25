export type ProductImage = { id: string; url: string; position: number };
export type Product = {
    id: string;
    name: string;
    description: string;
    priceCents: number;
    stock: number;
    stockVersion: number;
    coverImageId: string | null;
    images: ProductImage[];
};
export type ProductLog = {
    id: string;
    productId: string;
    productName: string;
    actorEmail: string;
    action: string;
    createdAt: string;
    changes: Record<string, unknown>;
};
export type LogPage = {
    items: ProductLog[];
    total: number;
    page: number;
    pageSize: number;
};
export type Movement = {
    id: string;
    actorEmail: string;
    delta: number;
    stockAfter: number;
    reason: string;
    createdAt: string;
};
export class ApiError extends Error {
    details: { path: string[]; message: string }[];
    constructor(
        message: string,
        details: { path: string[]; message: string }[] = [],
    ) {
        super(message);
        this.details = details;
    }
}
export async function api<T>(
    path: string,
    method = "GET",
    body?: unknown,
): Promise<T> {
    const isFile = body instanceof FormData;
    const response = await fetch(path, {
        method,
        cache: "no-store",
        credentials: "same-origin",
        headers:
            body === undefined || isFile
                ? undefined
                : { "Content-Type": "application/json" },
        body:
            body === undefined
                ? undefined
                : isFile
                  ? body
                  : JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok)
        throw new ApiError(
            result?.message ??
                "Unable to complete the request. Please try again.",
            result?.details,
        );
    if (!result || !("data" in result))
        throw new Error("Unexpected response. Please try again.");
    return result.data;
}
export const money = (cents: number) =>
    new Intl.NumberFormat("en-SG", {
        style: "currency",
        currency: "SGD",
    }).format(cents / 100);
export const time = (date: string) => new Date(date).toLocaleString();
