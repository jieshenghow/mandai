import { Workspace } from "@/components/workspace";
import { OrdersScreen } from "@/components/orders-screen";

export default function Page() {
    return (
        <Workspace admin section="Orders">
            <OrdersScreen admin />
        </Workspace>
    );
}
