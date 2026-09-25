import Link from "next/link";

export default function NotFound() {
    return (
        <main className="mx-auto my-[20vh] max-w-160 p-6">
            <p className="mb-3 text-[11px] font-semibold tracking-[1.5px] text-text-subtle">
                404 · PAGE NOT FOUND
            </p>
            <h1 className="mb-3 text-[28px] font-semibold tracking-[-0.8px]">
                This page doesn’t exist
            </h1>
            <p className="text-text-subtle">
                The address may have changed, or the page is no longer available.
            </p>
            <Link
                className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-lg border border-transparent bg-accent px-3.5 py-[9px] font-medium text-white hover:bg-accent-button-hover disabled:cursor-wait disabled:opacity-60"
                href="/"
            >
                Back to workspace
            </Link>
        </main>
    );
}
