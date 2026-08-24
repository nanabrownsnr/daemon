import type { ReactNode } from "react";
import Link from "next/link";

export default function SiteHeader({
  homeHref = "/about",
  children,
}: {
  homeHref?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-5 py-8 sm:px-8 sm:py-12">
      <Link href={homeHref} className="text-sm text-neutral-500 transition-colors hover:text-neutral-300">
        groupwork
      </Link>
      <nav className="flex items-center gap-4 text-sm text-neutral-500" aria-label="Primary navigation">
        {children}
      </nav>
    </header>
  );
}
