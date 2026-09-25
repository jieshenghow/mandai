import { Workspace } from "@/components/workspace";
import { ProductsScreen } from "@/components/products-screen";
export default function Page() {
    return (
        <Workspace admin section="Products">
            <ProductsScreen />
        </Workspace>
    );
}
