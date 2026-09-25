import { api, ApiError } from "./products";
import type { Checkout, Order } from "./commerce";
import { loadAccount } from "./account";

export const checkoutSignInMessage = "Your checkout is still unconfirmed. Sign in with the original customer account, return to your cart in this tab, and retry checkout.";

export function readPendingCheckout(key: string): Checkout | null {
    try {
        const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
        return value && typeof value.requestId === "string" &&
            Number.isInteger(value.version) && Array.isArray(value.items) ? value : null;
    } catch {
        return null;
    }
}

export function savePendingCheckout(key: string, value: Checkout | null) {
    try {
        if (value) sessionStorage.setItem(key, JSON.stringify(value));
        else sessionStorage.removeItem(key);
    } catch {
        // The component also retains the request in memory when storage is unavailable.
    }
}

export async function submitCheckout(userId: string, input: Checkout, remember: (value: Checkout | null) => void): Promise<Order> {
    remember(input);
    // A mounted cart can outlive its session. Do not replay it under another account.
    const account = await loadAccount();
    if (account.status === "error") throw new Error(account.message);
    if (account.status !== "authenticated" || account.user.id !== userId || account.user.role !== "USER")
        throw new ApiError(checkoutSignInMessage, [], 401);
    try {
        const order = await api<Order>("/api/checkout", "POST", input);
        remember(null);
        return order;
    } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403))
            throw new ApiError(checkoutSignInMessage, [], error.status, error.code);
        // Only explicit checkout validation/conflict responses resolve a failed purchase.
        if (error instanceof ApiError && (error.status === 400 || error.status === 409)) remember(null);
        throw error;
    }
}
