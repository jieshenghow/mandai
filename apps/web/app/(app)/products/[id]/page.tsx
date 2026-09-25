import { Workspace } from "@/components/workspace";
import { ProductDetails } from "@/components/storefront";

export default async function Page({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return (
        <Workspace section="Product">
            <ProductDetails id={id} />
        </Workspace>
    );
}
