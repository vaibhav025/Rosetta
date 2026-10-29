import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export const buttonStyles = cva(
  "btn press relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5 t-small font-medium whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      variant: {
        /** Solid lime pill, slight glow; hover lift, shine and icon nudge live in motion-nav.css. */
        primary:
          "btn-primary bg-(--btn-primary-bg) font-semibold text-(--btn-primary-fg) shadow-[0_0_0_1px_rgba(255,255,255,0.18)_inset,0_6px_24px_-8px_var(--accent-glow)] not-disabled:hover:bg-(--btn-primary-hover) not-disabled:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.24)_inset,0_12px_36px_-6px_var(--accent-glow),0_0_28px_-4px_var(--accent-glow)]",
        /** Dark glass pill with a hairline border. */
        secondary:
          "btn-secondary bg-(--btn-secondary-bg) text-fg-1 shadow-[inset_0_0_0_1px_var(--ring-strong)] backdrop-blur-md enabled:hover:-translate-y-px enabled:hover:bg-(--btn-secondary-hover)",
        /** Dark outlined pill. */
        outline: "text-fg-1 shadow-[inset_0_0_0_1px_var(--ring-strong)] enabled:hover:bg-(--btn-secondary-bg)",
        ghost: "text-(--ghost-fg) enabled:hover:bg-surface-2 enabled:hover:text-fg-1",
      },
      /** The secondary button's small white dot icon. */
      dot: {
        true: "btn-dot before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        false: "",
      },
      size: {
        md: "h-10 pointer-coarse:h-11",
        icon: "size-10 px-0 pointer-coarse:size-11",
      },
    },
    defaultVariants: { variant: "secondary", size: "md", dot: false },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles> & { loading?: boolean };

/**
 * While loading, the label crossfades to a spinner (with a 2px blur during
 * the swap). The label keeps its space, so the button never changes width.
 */
export function Button({ variant, size, loading = false, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonStyles({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className="swap place-items-center">
        <span data-active={!loading} className="inline-flex items-center gap-2">
          {children}
        </span>
        <span data-active={loading} className="inline-flex items-center justify-center">
          <Spinner />
        </span>
      </span>
    </button>
  );
}
