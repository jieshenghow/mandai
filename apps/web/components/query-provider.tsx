"use client";

import {useState, type ReactNode} from "react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";

export function QueryProvider({children}: { children: ReactNode }) {
    const [client] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {staleTime: 30_000, retry: 1},
            // Never automatically repeat a POST such as a purchase or registration.
            mutations: {retry: false},
        },
    }));

    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
