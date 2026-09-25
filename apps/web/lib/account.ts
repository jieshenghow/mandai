import type { User } from "./route-access";

export type AccountState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "guest" }
    | { status: "authenticated"; user: User };

// Only an explicit unauthenticated response establishes a guest session.
export async function loadAccount(signal?: AbortSignal): Promise<AccountState> {
    try {
        const response = await fetch("/api/auth/me", { cache: "no-store", signal });
        if (response.status === 401) return { status: "guest" };
        if (!response.ok) throw new Error("Account request failed");
        const { data } = await response.json();
        if (!data || typeof data.id !== "string" || typeof data.email !== "string" ||
            !["USER", "ADMIN"].includes(data.role)) throw new Error("Invalid account response");
        return { status: "authenticated", user: data };
    } catch {
        return { status: "error", message: "Unable to load your account. Please retry." };
    }
}
