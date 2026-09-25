"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated local images are served without the Next image proxy. */
import { useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError, type Product, type ProductImage } from "@/lib/products";
import { Feedback, Modal, ModalCancel } from "./product-ui";

type UploadItem = {
    key: string;
    file: File;
    preview: string;
    state: "uploading" | "failed";
    error?: string;
};
export function ProductForm({
    product,
    close,
    saved,
}: {
    product?: Product;
    close: () => void;
    saved: () => void;
}) {
    const [name, setName] = useState(product?.name ?? "");
    const [description, setDescription] = useState(product?.description ?? "");
    const [price, setPrice] = useState(
        product ? (product.priceCents / 100).toFixed(2) : "",
    );
    const [stock, setStock] = useState("0");
    const [images, setImages] = useState<ProductImage[]>(product?.images ?? []);
    const [cover, setCover] = useState<string | null>(
        product?.coverImageId ?? null,
    );
    const [uploads, setUploads] = useState<UploadItem[]>([]);
    const [dirty, setDirty] = useState(false);
    const [imageError, setImageError] = useState<Error | null>(null);
    const uploading = useRef(false);
    // Only identifies previews within this form; persisted IDs come from the API.
    const nextUploadId = useRef(0);
    const input = useRef<HTMLInputElement>(null);
    const mutation = useMutation({
        mutationFn: (body: unknown) =>
            api(
                product
                    ? `/api/admin/products/${product.id}`
                    : "/api/admin/products",
                product ? "PATCH" : "POST",
                body,
            ),
        onSuccess: saved,
    });
    const busy =
        uploads.some((item) => item.state === "uploading") ||
        mutation.isPending;
    const fieldError = (field: string) =>
        mutation.error instanceof ApiError
            ? mutation.error.details.find((d) => d.path[0] === field)?.message
            : undefined;
    async function uploadItem(item: UploadItem) {
        try {
            const form = new FormData();
            form.append("image", item.file);
            const result = await api<ProductImage>(
                "/api/admin/product-images",
                "POST",
                form,
            );
            setImages((current) => [...current, result]);
            setCover((current) => current ?? result.id);
            setUploads((current) => current.filter((u) => u.key !== item.key));
            URL.revokeObjectURL(item.preview);
        } catch (error) {
            setUploads((current) =>
                current.map((u) =>
                    u.key === item.key
                        ? {
                              ...u,
                              state: "failed",
                              error: (error as Error).message,
                          }
                        : u,
                ),
            );
        }
    }
    async function addFiles(files: File[]) {
        if (uploading.current || mutation.isPending) return;
        setImageError(null);
        if (images.length + uploads.length + files.length > 8) {
            setImageError(new Error("A product can have at most 8 images."));
            return;
        }
        if (
            files.some(
                (file) =>
                    !["image/jpeg", "image/png", "image/webp"].includes(
                        file.type,
                    ) || file.size > 5 * 1024 * 1024,
            )
        ) {
            setImageError(
                new Error("Choose JPG, PNG or WebP files, each up to 5 MB."),
            );
            return;
        }
        uploading.current = true;
        setDirty(true);
        const items: UploadItem[] = [];
        try {
            for (const file of files) {
                items.push({
                    key: `upload-${nextUploadId.current++}`,
                    file,
                    preview: URL.createObjectURL(file),
                    state: "uploading",
                });
            }
        } catch {
            items.forEach((item) => URL.revokeObjectURL(item.preview));
            setImageError(
                new Error(
                    "Unable to prepare image previews. Please try again.",
                ),
            );
            uploading.current = false;
            return;
        }
        try {
            setUploads((current) => [...current, ...items]);
            for (const item of items) await uploadItem(item);
        } finally {
            uploading.current = false;
        }
    }
    function move(index: number, offset: number) {
        const next = [...images];
        [next[index], next[index + offset]] = [
            next[index + offset],
            next[index],
        ];
        setImages(next);
        setDirty(true);
    }
    function submit(event: FormEvent) {
        event.preventDefault();
        if (busy || uploads.length) return;
        // Parse decimal text into cents, avoiding a floating-point currency request.
        const [whole, fraction = ""] = price.split(".");
        const priceCents =
            Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
        mutation.mutate({
            name,
            description,
            priceCents,
            ...(product ? {} : { stock: Number(stock) }),
            imageIds: images.map((i) => i.id),
            coverImageId: cover,
        });
    }
    return (
        <Modal
            title={product ? "Edit product" : "Add product"}
            close={() => {
                uploads.forEach((u) => URL.revokeObjectURL(u.preview));
                close();
            }}
            dirty={dirty}
            busy={busy}
        >
            <form
                onSubmit={submit}
                onChange={() => setDirty(true)}
                className="space-y-5"
            >
                <fieldset disabled={mutation.isPending} className="space-y-5">
                    <label className="block">
                        <span className="field-label">Product name *</span>
                        <input
                            autoFocus
                            className="field"
                            required
                            maxLength={120}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            aria-invalid={!!fieldError("name")}
                        />
                        {fieldError("name") && (
                            <span className="text-sm text-danger">
                                {fieldError("name")}
                            </span>
                        )}
                    </label>
                    <label className="block">
                        <span className="field-label">Description</span>
                        <textarea
                            className="field min-h-24"
                            maxLength={2000}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label>
                            <span className="field-label">Price (SGD) *</span>
                            <input
                                className="field"
                                type="text"
                                inputMode="decimal"
                                pattern="[0-9]+(\.[0-9]{1,2})?"
                                title="Enter a price with up to 2 decimal places"
                                required
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                            />
                            {fieldError("priceCents") && (
                                <span className="text-sm text-danger">
                                    {fieldError("priceCents")}
                                </span>
                            )}
                            <span className="text-xs text-text-subtle">
                                S$0.01 – S$100,000.00
                            </span>
                        </label>
                        <label>
                            <span className="field-label">
                                {product ? "Current stock" : "Initial stock"}
                            </span>
                            <input
                                className="field"
                                type="number"
                                min={0}
                                max={1000000}
                                step={1}
                                required
                                readOnly={!!product}
                                value={product?.stock ?? stock}
                                onChange={(e) => setStock(e.target.value)}
                            />
                            {product && (
                                <span className="text-xs text-text-subtle">
                                    Use Stock in / Stock out to adjust
                                    inventory.
                                </span>
                            )}
                        </label>
                    </div>
                    <section aria-label="Product images">
                        <p className="field-label">
                            Product images · {images.length + uploads.length}/8
                        </p>
                        <p className="mb-3 text-xs text-text-subtle">
                            Optional. JPG, PNG or WebP · 5 MB each. Choose a
                            cover for the product list.
                        </p>
                        <div
                            className="rounded-lg border border-dashed border-border-strong p-5 text-center"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (!busy)
                                    void addFiles([...e.dataTransfer.files]);
                            }}
                        >
                            <input
                                ref={input}
                                className="sr-only"
                                aria-label="Upload product images"
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                multiple
                                disabled={busy}
                                onChange={(e) => {
                                    void addFiles([...(e.target.files ?? [])]);
                                    e.target.value = "";
                                }}
                            />
                            <button
                                className="btn"
                                type="button"
                                disabled={
                                    busy || images.length + uploads.length >= 8
                                }
                                onClick={() => input.current?.click()}
                            >
                                Choose images
                            </button>
                            <p className="mt-2 text-xs text-text-subtle">
                                or drag and drop here
                            </p>
                        </div>
                        <Feedback error={imageError} />
                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {images.map((image, index) => (
                                <div
                                    key={image.id}
                                    className="rounded-lg border border-border p-2"
                                >
                                    <img
                                        src={image.url}
                                        alt={`Product image ${index + 1}`}
                                        className="aspect-square w-full rounded-md object-cover"
                                    />
                                    <button
                                        type="button"
                                        className={`btn mt-2 w-full ${cover === image.id ? "btn-primary" : ""}`}
                                        aria-pressed={cover === image.id}
                                        onClick={() => {
                                            setCover(image.id);
                                            setDirty(true);
                                        }}
                                    >
                                        {cover === image.id
                                            ? "✓ Cover"
                                            : "Set cover"}
                                    </button>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        <button
                                            type="button"
                                            className="btn"
                                            aria-label={`Move image ${index + 1} earlier`}
                                            disabled={index === 0}
                                            onClick={() => move(index, -1)}
                                        >
                                            ←
                                        </button>
                                        <button
                                            type="button"
                                            className="btn"
                                            aria-label={`Move image ${index + 1} later`}
                                            disabled={
                                                index === images.length - 1
                                            }
                                            onClick={() => move(index, 1)}
                                        >
                                            →
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-danger"
                                            onClick={() => {
                                                const next = images.filter(
                                                    (i) => i.id !== image.id,
                                                );
                                                setImages(next);
                                                if (cover === image.id)
                                                    setCover(
                                                        next[0]?.id ?? null,
                                                    );
                                                setDirty(true);
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {uploads.map((item) => (
                                <div
                                    key={item.key}
                                    className="rounded-lg border border-border p-2"
                                >
                                    <img
                                        src={item.preview}
                                        alt={item.file.name}
                                        className="aspect-square w-full rounded-md object-cover"
                                    />
                                    <p
                                        className="mt-2 break-all text-xs"
                                        role="status"
                                    >
                                        {item.state === "uploading"
                                            ? "Uploading…"
                                            : item.error}
                                    </p>
                                    {item.state === "failed" && (
                                        <div className="mt-2 flex gap-1">
                                            <button
                                                className="btn"
                                                type="button"
                                                disabled={busy}
                                                onClick={async () => {
                                                    setUploads((current) =>
                                                        current.map((u) =>
                                                            u.key === item.key
                                                                ? {
                                                                      ...u,
                                                                      state: "uploading",
                                                                  }
                                                                : u,
                                                        ),
                                                    );
                                                    uploading.current = true;
                                                    await uploadItem(item);
                                                    uploading.current = false;
                                                }}
                                            >
                                                Retry
                                            </button>
                                            <button
                                                className="btn"
                                                type="button"
                                                disabled={busy}
                                                onClick={() => {
                                                    setUploads((current) =>
                                                        current.filter(
                                                            (u) =>
                                                                u.key !==
                                                                item.key,
                                                        ),
                                                    );
                                                    URL.revokeObjectURL(
                                                        item.preview,
                                                    );
                                                }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                </fieldset>
                <Feedback error={mutation.error} />
                <div className="flex justify-end gap-3 border-t border-border pt-5">
                    <ModalCancel disabled={busy} />
                    <button
                        className="btn btn-primary"
                        disabled={busy || uploads.length > 0}
                    >
                        {mutation.isPending
                            ? "Saving…"
                            : product
                              ? "Save changes"
                              : "Create product"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
