"use client";

import { useState, type ReactNode } from "react";

export default function CollapsibleSidebarSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section className="border-b border-neutral-800 p-4">
      <div className={`flex items-center justify-between ${open ? "mb-3" : ""}`}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-500 transition-colors hover:text-neutral-300"
        >
          <span className={`text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          {title}
        </button>
        {action}
      </div>
      {open && children}
    </section>
  );
}
