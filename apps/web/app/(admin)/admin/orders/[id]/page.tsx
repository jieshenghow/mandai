import { Workspace } from "@/components/workspace";
import { OrderDetails } from "@/components/orders-screen";

export default async function Page({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return (
        <Workspace admin section="Order">
            <OrderDetails id={id} admin />
        </Workspace>
    );
}
