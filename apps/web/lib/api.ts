/** POST an API request and unwrap the project's { data } response. */
export async function postApi<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: body === undefined ? undefined : {"Content-Type": "application/json"},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(
            typeof result?.message === "string"
                ? result.message
                : "Unable to complete the request. Please try again.",
        );
    }
    if (!result || typeof result !== "object" || !("data" in result)) {
        throw new Error("The server returned an unexpected response. Please try again.");
    }
    return result.data as T;
}
