import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-11 w-full rounded-full bg-surface-1 px-4 text-base text-fg-1 shadow-ring-strong outline-none transition-[box-shadow] duration-150 placeholder:text-fg-3 focus-visible:shadow-[0_0_0_2px_var(--focus)] read-only:text-fg-3 aria-invalid:shadow-[0_0_0_2px_var(--risk-high)]";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  ref?: Ref<HTMLInputElement>;
};

/** Label above, input, then the hint or the error. */
export function Field({ label, hint, error, optional, id, className, ref, ...props }: FieldProps) {
  const inputId = id ?? props.name;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cn("grid gap-2", className)}>
      <label htmlFor={inputId} className="t-small font-medium text-fg-1">
        {label}
        {optional && <span className="font-normal text-fg-3"> (optional)</span>}
        {props.required && <span className="font-normal text-fg-3"> (required)</span>}
      </label>
      <input ref={ref} id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={inputClass} {...props} />
      {error ? (
        <p id={`${inputId}-error`} className="t-small font-medium text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${inputId}-hint`} className="t-small text-fg-3">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** A plain solid page wrapper for forms. */
export function FormShell({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-(--w-app) px-(--gutter) pt-12 pb-24 md:pt-16">
      <h1 className="t-title text-balance text-fg-1">{title}</h1>
      {lead && <p className="mt-3 max-w-[36rem] t-body text-fg-2">{lead}</p>}
      <div className="mt-10">{children}</div>
    </main>
  );
}
