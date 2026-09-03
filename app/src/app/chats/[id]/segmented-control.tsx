"use client";

export default function SegmentedControl({
  value, options, onChange, ariaLabel, disabled = false,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-md border border-neutral-700 bg-neutral-950 p-0.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={value === option.value} disabled={disabled}
          className={`min-w-0 flex-1 rounded px-1.5 py-1 text-[11px] transition-colors disabled:opacity-50 ${value === option.value ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
