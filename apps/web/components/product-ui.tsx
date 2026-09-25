"use client";
import {
    createContext,
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
    type ReactNode,
} from "react";

const ModalDismissContext = createContext<(() => void) | null>(null);

export function ModalCancel({ disabled = false }: { disabled?: boolean }) {
    const dismiss = useContext(ModalDismissContext);
    return (
        <button
            type="button"
            className="btn"
            disabled={disabled}
            onClick={() => dismiss?.()}
        >
            Cancel
        </button>
    );
}
export function Modal({
    title,
    children,
    close,
    dirty = false,
    busy = false,
}: {
    title: string;
    children: ReactNode;
    close: () => void;
    dirty?: boolean;
    busy?: boolean;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const id = useId();
    useEffect(() => {
        const dialog = ref.current!;
        const previous = document.activeElement as HTMLElement | null;
        dialog.showModal();
        return () => {
            dialog.close();
            previous?.focus();
        };
    }, []);
    function dismiss() {
        if (busy) return;
        if (dirty) setConfirmDiscard(true);
        else close();
    }
    return (
        <>
            <dialog
                ref={ref}
                aria-labelledby={id}
                className="product-dialog"
                onCancel={(e) => {
                    e.preventDefault();
                    dismiss();
                }}
            >
                <header className="flex items-center justify-between gap-4 border-b border-border p-6">
                    <h2 id={id} className="text-xl font-semibold">
                        {title}
                    </h2>
                    <button
                        className="btn"
                        aria-label="Close dialog"
                        disabled={busy}
                        onClick={dismiss}
                    >
                        ✕
                    </button>
                </header>
                <ModalDismissContext.Provider value={dismiss}>
                    <div className="p-6">{children}</div>
                </ModalDismissContext.Provider>
            </dialog>
            {confirmDiscard && (
                <Modal
                    title="Discard unsaved changes?"
                    close={() => setConfirmDiscard(false)}
                >
                    <p className="text-text-muted">
                        Your changes have not been saved. Discard them and close
                        this form?
                    </p>
                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            type="button"
                            className="btn"
                            autoFocus
                            onClick={() => setConfirmDiscard(false)}
                        >
                            Keep editing
                        </button>
                        <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => {
                                if (!busy) close();
                            }}
                        >
                            Discard changes
                        </button>
                    </div>
                </Modal>
            )}
        </>
    );
}
export function Feedback({ error }: { error: Error | null | undefined }) {
    return error ? (
        <p
            role="alert"
            className="my-4 rounded-lg border border-danger-border bg-danger-surface p-3 text-danger"
        >
            {error.message}
        </p>
    ) : null;
}
export function Status({ stock }: { stock: number }) {
    return (
        <span
            className={`rounded-md border px-2 py-1 text-xs ${stock === 0 ? "border-danger-border text-danger" : stock <= 5 ? "border-amber-900 text-amber-300" : "border-emerald-900 text-emerald-300"}`}
        >
            {stock === 0 ? "Sold Out" : stock <= 5 ? "Low Stock" : "In Stock"}
        </span>
    );
}
