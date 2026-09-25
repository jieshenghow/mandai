"use client";
import Link from "next/link";

export default function ErrorPage({reset}: { reset: () => void }) {
    return (
        <main className="mx-auto my-[20vh] max-w-160 p-6">
            <p className="mb-3 text-[11px] font-semibold tracking-[1.5px] text-text-subtle">
                SOMETHING WENT WRONG
            </p>
            <h1 className="mb-3 text-[28px] font-semibold tracking-[-0.8px]">
                We couldn’t load this page
            </h1>
            <p className="text-text-subtle">Please try again in a moment.</p>
            <div className="flex flex-wrap items-center gap-4">
                <button
                    className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-lg border border-transparent bg-accent px-3.5 py-[9px] font-medium text-white hover:bg-accent-button-hover disabled:cursor-wait disabled:opacity-60"
                    onClick={reset}
                >
                    Try again
                </button>
                <Link href="/">Back to workspace</Link>
            </div>
        </main>
    );
}
