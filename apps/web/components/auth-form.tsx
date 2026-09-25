"use client";
import {useMutation} from "@tanstack/react-query";
import Link from "next/link";
import {homeFor, type User} from "@/lib/route-access";
import {postApi} from "@/lib/api";
import React from "react";

export function AuthForm({mode}: { mode: "login" | "register" }) {
    const register = mode === "register";
    const mutation = useMutation({
        mutationFn: (credentials: { email: string; password: string }) =>
            postApi<User>(`/api/auth/${mode}`, credentials),
        onSuccess: (user) => {
            // Reload through the server route guard with the newly set session cookie.
            window.location.assign(homeFor(user.role));
        },
        gcTime: 0,
    });
    const pending = mutation.isPending || mutation.isSuccess;
    const error = mutation.error?.message;

    function submit(event: React.ChangeEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending) return;
        const form = new FormData(event.currentTarget);
        mutation.mutate({
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
        });
    }

    return (
        <main className="flex min-h-svh flex-col items-center justify-center px-4 py-8">
            <div className="w-full max-w-100 rounded-xl border border-border bg-surface-1 p-8 max-[641px]:p-6">
                <Link
                    href="/"
                    className="flex items-center gap-2.5 text-[16px] font-semibold"
                >
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-[14px]">
            M
          </span>{" "}
                    Mandai
                </Link>
                <div className="mt-9 mb-7">
                    <p className="mb-3 text-[11px] font-semibold tracking-[1.5px] text-text-subtle">
                        YOUR WORKSPACE
                    </p>
                    <h1 className="mb-3 text-[28px] font-semibold tracking-[-0.8px]">
                        {register ? "Create your account" : "Welcome back"}
                    </h1>
                    <p className="text-text-subtle">
                        {register
                            ? "Get started with your Mandai account."
                            : "Sign in to continue to Mandai."}
                    </p>
                </div>
                <form method={"post"} onSubmit={submit} className="flex flex-col gap-5">
                    <label className="flex flex-col gap-2 font-medium text-text-muted">
                        Email address
                        <input
                            className="h-10.5 w-full rounded-lg border border-border-strong bg-canvas px-3 placeholder:text-text-subtle"
                            name="email"
                            type="email"
                            autoComplete="email"
                            placeholder="you@example.com"
                            required
                            maxLength={255}
                            disabled={pending}
                        />
                    </label>
                    <label className="flex flex-col gap-2 font-medium text-text-muted">
                        Password
                        <input
                            className="h-10.5 w-full rounded-lg border bg-canvas px-3 placeholder:text-text-subtle focus:border-accent"
                            name="password"
                            type="password"
                            autoComplete={register ? "new-password" : "current-password"}
                            placeholder={
                                register ? "Choose a password" : "Enter your password"
                            }
                            required
                            disabled={pending}
                        />
                    </label>
                    {register && (
                        <p className="text-[12px] text-text-subtle">
                            Choose a strong password with at least 8 letters or numbers.
                        </p>
                    )}
                    {error && (
                        <p
                            className="rounded-lg border border-danger-border bg-danger-surface p-3 text-[13px] text-danger"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}
                    <button
                        className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-transparent bg-accent px-3.5 py-2.25 font-medium text-white hover:bg-accent-button-hover disabled:opacity-60"
                        disabled={pending}
                    >
                        {pending ? "Please wait…" : register ? "Create account" : "Sign in"}
                    </button>
                </form>
                <p className="mt-6 text-center text-[13px] text-text-subtle">
                    {register ? "Already have an account?" : "New to Mandai?"}{" "}
                    <Link
                        className="text-accent-hover"
                        href={register ? "/login" : "/register"}
                    >
                        {register ? "Sign in" : "Create an account"}
                    </Link>
                </p>
            </div>
            <p className="mt-6 text-[12px] text-text-subtle">
                Mandai · Product & inventory workspace
            </p>
        </main>
    );
}
