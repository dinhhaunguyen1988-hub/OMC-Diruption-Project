"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export type ToastKind = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  /**
   * Time in milliseconds before the toast auto-dismisses. Pass 0 to keep it
   * visible until the user dismisses it manually. Defaults to 5000.
   */
  duration?: number;
  /** Optional secondary line shown smaller under the title. */
  description?: string;
}

export interface Toast extends ToastOptions {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  show: (kind: ToastKind, message: string, opts?: ToastOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let __toastSeq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string, opts: ToastOptions = {}) => {
      const id = `toast-${++__toastSeq}`;
      const duration = opts.duration ?? 5000;
      setToasts((prev) => [
        ...prev,
        { id, kind, message, description: opts.description, duration },
      ]);
      if (duration > 0) {
        const t = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, t);
      }
      return id;
    },
    [dismiss],
  );

  const clear = useCallback(() => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    setToasts([]);
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, show, dismiss, clear }}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  // Return a small surface area: callers usually only want to push toasts.
  return {
    success: (message: string, opts?: ToastOptions) =>
      ctx.show("success", message, opts),
    error: (message: string, opts?: ToastOptions) =>
      ctx.show("error", message, opts),
    info: (message: string, opts?: ToastOptions) =>
      ctx.show("info", message, opts),
    warning: (message: string, opts?: ToastOptions) =>
      ctx.show("warning", message, opts),
    dismiss: ctx.dismiss,
    clear: ctx.clear,
  };
}

/** Internal — UI rendering only. Mounted automatically by ToastProvider. */
function Toaster() {
  const ctx = useContext(ToastContext);
  if (!ctx) return null;
  if (ctx.toasts.length === 0) return null;
  return (
    <div
      data-testid="toaster"
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[320px] max-w-[calc(100vw-2rem)]"
    >
      {ctx.toasts.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={() => ctx.dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastView({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const styles = STYLES[toast.kind];
  return (
    <div
      data-testid={`toast-${toast.kind}`}
      className={cn(
        "rounded-md border shadow-sm p-3 text-sm flex items-start gap-2",
        styles.container,
      )}
    >
      <span aria-hidden className={cn("font-bold leading-5", styles.icon)}>
        {styles.symbol}
      </span>
      <div className="flex-1 min-w-0">
        <div className={cn("font-medium leading-5 break-words", styles.title)}>
          {toast.message}
        </div>
        {toast.description && (
          <div className="text-xs mt-0.5 opacity-80 break-words">
            {toast.description}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="text-zinc-400 hover:text-zinc-700 leading-none px-1"
      >
        ×
      </button>
    </div>
  );
}

const STYLES: Record<
  ToastKind,
  { container: string; title: string; icon: string; symbol: string }
> = {
  success: {
    container: "border-emerald-300 bg-emerald-50 text-emerald-900",
    title: "text-emerald-900",
    icon: "text-emerald-600",
    symbol: "✓",
  },
  error: {
    container: "border-red-300 bg-red-50 text-red-900",
    title: "text-red-900",
    icon: "text-red-600",
    symbol: "!",
  },
  info: {
    container: "border-sky-300 bg-sky-50 text-sky-900",
    title: "text-sky-900",
    icon: "text-sky-600",
    symbol: "i",
  },
  warning: {
    container: "border-amber-300 bg-amber-50 text-amber-900",
    title: "text-amber-900",
    icon: "text-amber-600",
    symbol: "!",
  },
};
