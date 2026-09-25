import type { Product } from "./products";
export type StoreProduct = Omit<Product, "stockVersion">;
export type CartItem = {
    productId: string;
    name: string;
    quantity: number;
    priceCents: number;
    stock: number;
    imageUrl: string | null;
    available: boolean;
    unavailableReason: string | null;
    archived: boolean;
};
export type Cart = {
    userId: string;
    version: number;
    items: CartItem[];
    totalAmountCents: number;
};
export type Order = {
    id: string;
    createdAt: string;
    totalAmountCents: number;
    items: {
        id: string;
        productId: string;
        productName: string;
        quantity: number;
        unitPriceCents: number;
    }[];
};
export type OrderPage = {
    items: Order[];
    total: number;
    page: number;
    pageSize: number;
};
export type Checkout = {
    requestId: string;
    version: number;
    items: { productId: string; quantity: number; priceCents: number }[];
};
export const cartKey = ["cart"] as const;
export function checkoutItems(cart: Cart): Checkout["items"] {
    return cart.items
        .filter((i) => i.available)
        .map(({ productId, quantity, priceCents }) => ({
            productId,
            quantity,
            priceCents,
        }));
}
