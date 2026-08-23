import AuthorizeConnector from "./authorize-client";

export default async function ConnectorAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ callback?: string; state?: string }>;
}) {
  const { callback, state } = await searchParams;
  let valid = false;
  try {
    const callbackUrl = new URL(callback ?? "");
    valid = callbackUrl.protocol === "http:"
      && callbackUrl.hostname === "127.0.0.1"
      && callbackUrl.pathname === "/callback"
      && /^[a-f0-9]{48}$/.test(state ?? "");
  } catch {
    valid = false;
  }

  const returnPath = `/connector/authorize?callback=${encodeURIComponent(callback ?? "")}&state=${encodeURIComponent(state ?? "")}`;

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-16 text-neutral-100">
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <p className="text-sm text-neutral-500">groupwork</p>
          <h1 className="mt-2 text-xl font-semibold">connector authorization</h1>
        </div>
        {valid ? (
          <AuthorizeConnector
            callback={callback!}
            state={state!}
            loginPath={`/auth?next=${encodeURIComponent(returnPath)}`}
          />
        ) : (
          <p className="rounded border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
            This authorization request is invalid. Return to the terminal and run groupwork-connect login again.
          </p>
        )}
      </div>
    </main>
  );
}

