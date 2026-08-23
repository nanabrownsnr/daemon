"use client";

export default function LoginCommand({ className }: { className: string }) {
  const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
  return <pre suppressHydrationWarning className={className}>groupwork-connect login --app-url {origin}</pre>;
}
