import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

const buttonStyles = {
  primary: "rounded bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50",
  secondary: "rounded bg-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50",
  quiet: "px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50",
  link: "text-sm text-neutral-500 transition-colors hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-50",
} as const;

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonStyles }) {
  return <button {...props} className={`${buttonStyles[variant]} ${className}`} />;
}

export function IconButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} />;
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 transition-colors focus:border-neutral-400 focus:ring-1 focus:ring-neutral-500/40 ${className}`} />;
}

export function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" aria-label="Close dialog" className="absolute inset-0 cursor-default bg-black/70" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-sm space-y-4 rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-medium text-neutral-100">{title}</h2>
          <IconButton onClick={onClose} aria-label="Close dialog" className="-mr-2">×</IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
