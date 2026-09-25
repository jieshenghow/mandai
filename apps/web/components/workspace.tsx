"use client";
import Link from "next/link";
import {useEffect, createContext, useContext, type ReactNode} from "react";
import {redirectFor} from "@/lib/route-access";
import {usePathname} from "next/navigation";
import {loadAccount, type AccountState} from "@/lib/account";
const loadingAccount: AccountState = {status: "loading"};
const AccountContext = createContext<AccountState>(loadingAccount);
export const useAccount = () => useContext(AccountContext);
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {postApi} from "@/lib/api";

export function Workspace({admin = false, children, section = "Overview"}: { admin?: boolean; children?: ReactNode; section?: string }) {
    const accountQuery = useQuery({
        queryKey: ["account"],
        queryFn: ({signal}) => loadAccount(signal),
        staleTime: 0,
        refetchOnMount: "always",
    });
    const account: AccountState = accountQuery.isFetching || !accountQuery.data
        ? loadingAccount : accountQuery.data;
    const pathname = usePathname();
    const user = account.status === "authenticated" ? account.user : null;
    const queryClient = useQueryClient();
    const logoutMutation = useMutation({
        mutationFn: () => postApi<{ success: boolean }>("/api/auth/logout"),
        onSuccess: () => {
            queryClient.clear();
            window.location.replace("/login");
        },
    });
    const pending = logoutMutation.isPending || logoutMutation.isSuccess;
    const displayedError = logoutMutation.error?.message;
    useEffect(() => {
        if (account.status === "authenticated" || account.status === "guest") {
            const redirect = redirectFor(pathname, account.status === "authenticated" ? account.user.role : null);
            if (redirect) window.location.replace(redirect);
        }
    }, [pathname, account]);
    return (
        <AccountContext.Provider value={account}><div className="flex min-h-svh max-[641px]:flex-col">
            {admin && (
                <aside
                    className="flex w-58 shrink-0 flex-col gap-3 border-r border-border bg-surface-1 px-4 py-6 max-[641px]:w-full max-[641px]:gap-2 max-[641px]:border-r-0 max-[641px]:border-b max-[641px]:p-4">
                    <Link
                        href="/admin"
                        className="mx-2 mb-9 flex items-center gap-2.5 text-[16px] font-semibold max-[641px]:mx-0 max-[641px]:mb-3"
                    >
            <span className="grid size-7 place-items-center rounded-lg bg-accent text-[14px]">
              M
            </span>{" "}
                        Mandai
                    </Link>
                    <p className="pl-3 text-[11px] font-semibold tracking-[1.5px] text-text-subtle max-[641px]:hidden">
                        WORKSPACE
                    </p>
                    <Link
                        href="/admin"
                        className="rounded-lg px-3 py-2.5 text-text-muted aria-[current=page]:bg-surface-2"
                        aria-current={section === "Overview" ? "page" : undefined}
                    >
                        Overview
                    </Link>
                    <Link href="/admin/products" className="rounded-lg px-3 py-2.5 text-text-muted aria-[current=page]:bg-surface-2" aria-current={section === "Products" ? "page" : undefined}>Products</Link>
                    <Link href="/admin/orders" className="rounded-lg px-3 py-2.5 text-text-muted aria-[current=page]:bg-surface-2" aria-current={section === "Orders" ? "page" : undefined}>Orders</Link>
                    <Link href="/admin/product-logs" className="rounded-lg px-3 py-2.5 text-text-muted aria-[current=page]:bg-surface-2" aria-current={section === "Product logs" ? "page" : undefined}>Product logs</Link>
                    <Link href="/" className="rounded-lg px-3 py-2.5 text-text-muted">
                        Browse shop ↗
                    </Link>
                    <span className="mt-auto p-3 text-[12px] text-text-subtle max-[641px]:hidden">
            Inventory administration
          </span>
                </aside>
            )}
            <div className="min-w-0 flex-1">
                <header
                    className="flex min-h-18 items-center justify-between gap-4 border-b border-border px-8 py-4 text-[13px] text-text-subtle max-[641px]:flex-wrap max-[641px]:px-4">
          <span>
            {admin ? `Administration / ${section}` : `Mandai / ${section}`}
          </span>
                    <div className="flex flex-wrap items-center gap-4">
                        {!admin && <nav aria-label="Store navigation" className="flex gap-4"><Link href="/" aria-current={section === "Collection" ? "page" : undefined}>Shop</Link>{user?.role === "USER" && <><Link href="/cart" aria-current={section === "Cart" ? "page" : undefined}>Cart</Link><Link href="/orders" aria-current={section === "Orders" ? "page" : undefined}>Orders</Link></>}</nav>}
                        {user?.role === "ADMIN" && !admin && (
                            <Link href="/admin">Administration</Link>
                        )}
                        {user ? <button
                            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-border bg-surface-1 px-3.5 py-[9px] font-medium hover:bg-surface-2 disabled:cursor-wait disabled:opacity-60"
                            onClick={() => logoutMutation.mutate()}
                            disabled={pending}
                        >
                            {pending ? "Signing out…" : "Sign out"}
                        </button> : account.status === "guest" ? <Link href="/login">Sign in</Link> : <span>{account.status === "error" ? "Account unavailable" : "Loading account…"}</span>}
                    </div>
                </header>
                <main className="mx-auto max-w-260 px-8 py-12 max-[641px]:px-4 max-[641px]:py-8">
                    {displayedError && (
                        <p
                            role="alert"
                            className="rounded-lg border border-danger-border bg-danger-surface p-3 text-[13px] text-danger"
                        >
                            {displayedError}
                        </p>
                    )}
                    {account.status === "error" && (
                        <div role="alert" className="mb-6 rounded-lg border border-danger-border bg-danger-surface p-3 text-danger">
                            <p>{account.message}</p>
                            <button className="btn mt-3" onClick={() => {
                                void accountQuery.refetch();
                            }}>Retry account</button>
                        </div>
                    )}
                    {children ?? <>
                    <p className="mb-3 text-[11px] font-semibold tracking-[1.5px] text-text-subtle">
                        {admin ? "ADMINISTRATION" : "YOUR WORKSPACE"}
                    </p>
                    <h1 className="mb-3 text-[28px] font-semibold tracking-[-0.8px]">
                        {admin ? "Workspace overview" : "Welcome to Mandai"}
                    </h1>
                    <p className="mb-8 text-text-subtle">
                        {admin
                            ? "Your inventory workspace starts here."
                            : "You’re signed in and ready to get started."}
                    </p>
                    <section className="rounded-xl border border-border bg-surface-1 p-6 max-[641px]:p-4">
                        <div className="mb-6 flex items-center justify-between gap-4">
                            <h2 className="text-[20px] font-semibold">Your account</h2>
                            {user && (
                                <span
                                    className="rounded-md border border-border-strong px-2 py-1 text-[12px] text-text-muted">
                  {user.role === "ADMIN" ? "Administrator" : "Member"}
                </span>
                            )}
                        </div>
                        {user ? (
                            <>
                                <p className="text-[12px] text-text-subtle">Email address</p>
                                <p className="mt-1 wrap-anywhere">{user.email}</p>
                            </>
                        ) : (
                            <p role="status" className="mt-1 wrap-anywhere">
                                {account.status === "error" ? "Account unavailable" : account.status === "guest" ? "Not signed in" : "Loading account…"}
                            </p>
                        )}
                    </section>
                    <section className="mt-6 rounded-xl border border-border px-6 py-14 text-center">
            <span
                className="mb-4 block text-[32px] text-text-subtle"
                aria-hidden="true"
            >
              ▦
            </span>
                        <h2 className="text-[20px] font-semibold">
                            {admin ? "Manage your inventory" : "Your workspace is ready"}
                        </h2>
                        <p className="text-text-subtle">
                            {admin
                                ? "Create products, manage stock and review product changes."
                                : "Products and purchasing will be available here soon."}
                        </p>
                        {admin && <Link href="/admin/products" className="mt-4 inline-block text-accent-hover">Open products →</Link>}
                    </section>
                    </>}
                </main>
            </div>
        </div></AccountContext.Provider>
    );
}
