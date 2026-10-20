"use client";
/** Small shadcn-style primitives (Tailwind + Radix), kept in-repo. */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { X } from "lucide-react";
import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

/** Class names with Tailwind conflict resolution (later classes win, e.g. `w-36` over `w-full`). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

type Variant = "default" | "primary" | "ghost" | "danger" | "outline";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }>(
  function Button({ className, variant = "default", size = "md", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors select-none",
          "disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]",
          size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm",
          variant === "default" && "bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--fg)]",
          variant === "primary" && "bg-[var(--accent)] hover:opacity-90 text-white",
          variant === "ghost" && "hover:bg-[var(--surface-2)] text-[var(--fg)]",
          variant === "outline" && "border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--fg)]",
          variant === "danger" && "bg-red-600 hover:bg-red-700 text-white",
          className,
        )}
        {...props}
      />
    );
  },
);

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }>(
  function IconButton({ className, label, active, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        aria-pressed={active}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--fg-muted)] transition-colors",
          "hover:bg-[var(--surface-2)] hover:text-[var(--fg)] disabled:opacity-30 disabled:pointer-events-none",
          "focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
          active && "bg-[var(--accent-soft)] text-[var(--accent)]",
          className,
        )}
        {...props}
      />
    );
  },
);

const fieldCls =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] focus:border-[var(--accent)]";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} dir="auto" className={cn(fieldCls, "h-8", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} dir="auto" className={cn(fieldCls, "min-h-16 resize-y leading-relaxed", className)} {...p} />;
});

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldCls, "h-8 py-0", className)} {...p}>
      {children}
    </select>
  );
}

/**
 * Text input that commits on blur / Enter instead of on every keystroke, so
 * one edit is one undo step. Escape reverts.
 */
export function CommitInput({
  value,
  onCommit,
  multiline,
  className,
  ...rest
}: { value: string; onCommit: (v: string) => void; multiline?: boolean; className?: string } & Omit<
  InputHTMLAttributes<HTMLInputElement> & TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
>) {
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    // External change (undo, another view): adopt it.
    setPrev(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    value: draft,
    className,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(value);
        (e.target as HTMLElement).blur();
      } else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
    },
  };
  return multiline ? <Textarea {...(rest as object)} {...common} /> : <Input {...(rest as object)} {...common} />;
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2 text-xs font-medium text-[var(--fg-muted)]">
      <span>{children}</span>
      {hint && <span className="font-normal text-[var(--fg-subtle)]">{hint}</span>}
    </div>
  );
}

export function Chip({ color, children, className }: { color?: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-medium", className)}
      style={{ background: color ? `${color}22` : "var(--surface-2)", color: color ?? "var(--fg-muted)" }}
    >
      {children}
    </span>
  );
}

export function Section({ title, children, actions }: { title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-t border-[var(--border)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-[var(--fg-muted)]">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Swatches({ colors, value, onChange, allowNone }: { colors: string[]; value?: string | null; onChange: (c: string | undefined) => void; allowNone?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {allowNone && (
        <button
          type="button"
          title="افتراضي"
          onClick={() => onChange(undefined)}
          className={cn("h-6 w-6 rounded-full border border-dashed border-[var(--border-strong)] text-[10px]", !value && "ring-2 ring-[var(--accent)]")}
        >
          —
        </button>
      )}
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className={cn("h-6 w-6 rounded-full border border-black/10", value === c && "ring-2 ring-offset-1 ring-[var(--accent)] ring-offset-[var(--surface)]")}
          style={{ background: c }}
        />
      ))}
      <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-[var(--border-strong)]" title="لون مخصص">
        <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] opacity-70" />
        <input type="color" className="absolute inset-0 opacity-0" value={value ?? "#888888"} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          dir="rtl"
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl",
            wide ? "max-w-2xl" : "max-w-md",
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-1 text-sm text-[var(--fg-muted)]">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton label="إغلاق">
                <X size={16} />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Popover({
  trigger,
  children,
  align = "center",
  side = "bottom",
}: {
  trigger: ReactNode;
  /** Either content, or a render function receiving `close` (for menus). */
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          dir="rtl"
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-h-[70vh] min-w-48 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 text-sm shadow-xl"
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function MenuItem({ children, onSelect, danger, disabled, icon, shortcut }: { children: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; icon?: ReactNode; shortcut?: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-[var(--surface-2)] disabled:opacity-40",
        danger ? "text-red-600 dark:text-red-400" : "text-[var(--fg)]",
      )}
    >
      {icon && <span className="flex w-4 justify-center text-[var(--fg-muted)]">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && (
        <kbd dir="ltr" className="text-[10px] text-[var(--fg-subtle)]">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-[var(--border)]" />;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-[var(--fg-muted)]">
      <div className="font-medium text-[var(--fg)]">{title}</div>
      {children}
    </div>
  );
}
