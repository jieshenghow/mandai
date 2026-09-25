import { Workspace } from "@/components/workspace";
import { ProductLogs } from "@/components/product-logs";
export default function Page() {
    return (
        <Workspace admin section="Product logs">
            <h1 className="mb-2 text-[28px] font-semibold">Product logs</h1>
            <p className="mb-8 text-text-subtle">
                Who changed what, and when. Includes archived products.
            </p>
            <ProductLogs />
        </Workspace>
    );
}
