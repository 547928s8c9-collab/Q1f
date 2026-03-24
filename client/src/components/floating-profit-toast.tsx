import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface ProfitToast {
  id: string;
  amount: number;
  createdAt: number;
}

const TOAST_DURATION_MS = 2500;
const MAX_TOASTS = 6;

function ProfitToastItem({ toast, onRemove }: { toast: ProfitToast; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 300);
    }, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const isProfit = toast.amount >= 0;
  const formatted = `${isProfit ? "+" : ""}$${Math.abs(toast.amount).toFixed(2)}`;

  return (
    <div
      data-testid={`profit-toast-${toast.id}`}
      className={cn(
        "pointer-events-none select-none font-mono text-sm font-bold px-3 py-1.5 rounded-md shadow-lg transition-all duration-500 ease-out whitespace-nowrap",
        isProfit
          ? "text-positive bg-positive/10 border border-positive/20"
          : "text-negative bg-negative/10 border border-negative/20",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-4"
      )}
    >
      {formatted}
    </div>
  );
}

export function FloatingProfitToastContainer() {
  const [toasts, setToasts] = useState<ProfitToast[]>([]);

  const handleRemove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { amount: number; id: string };
      if (!detail || typeof detail.amount !== "number") return;
      setToasts((prev) => {
        const next = [...prev, { id: detail.id || `t-${Date.now()}-${Math.random()}`, amount: detail.amount, createdAt: Date.now() }];
        if (next.length > MAX_TOASTS) return next.slice(-MAX_TOASTS);
        return next;
      });
    };
    window.addEventListener("profit-toast", handler);
    return () => window.removeEventListener("profit-toast", handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      data-testid="floating-profit-container"
      className="fixed top-[120px] right-8 z-50 flex flex-col gap-2 items-end pointer-events-none md:right-[calc(50%-320px)]"
    >
      {toasts.map((toast) => (
        <ProfitToastItem key={toast.id} toast={toast} onRemove={handleRemove} />
      ))}
    </div>
  );
}

export function emitProfitToast(amount: number, id?: string) {
  window.dispatchEvent(
    new CustomEvent("profit-toast", {
      detail: { amount, id: id || `t-${Date.now()}-${Math.random()}` },
    })
  );
}
