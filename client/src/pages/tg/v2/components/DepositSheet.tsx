import { useState } from "react";
import { X, Copy, Check, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const FALLBACK_ADDRESS = "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL";

interface DepositSheetProps {
  open: boolean;
  onClose: () => void;
}

type Mode = "menu" | "crypto";

export function DepositSheet({ open, onClose }: DepositSheetProps) {
  const [mode, setMode] = useState<Mode>("menu");
  const [copied, setCopied] = useState(false);

  const depositAddress = FALLBACK_ADDRESS;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMoonPay = () => {
    // TODO: set VITE_MOONPAY_API_KEY in environment
    const apiKey = import.meta.env.VITE_MOONPAY_API_KEY ?? "TODO";
    window.open(
      `https://buy.moonpay.com?apiKey=${apiKey}&currencyCode=usdt_trc20`,
      "_blank"
    );
  };

  const handleClose = () => {
    setMode("menu");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative rounded-t-2xl bg-background px-4 pb-10 pt-4">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">Пополнить счёт</h2>
          <button type="button" onClick={handleClose} className="text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {mode === "menu" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setMode("crypto")}
              className="w-full rounded-xl border border-border px-4 py-4 text-left text-sm font-medium transition hover:border-primary/40"
            >
              Крипто (TRC20)
            </button>
            <button
              type="button"
              onClick={handleMoonPay}
              className="w-full rounded-xl border border-border px-4 py-4 text-left text-sm font-medium transition hover:border-primary/40"
            >
              Карта (MoonPay)
            </button>
          </div>
        )}

        {mode === "crypto" && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setMode("menu")}
              className={cn("flex items-center gap-1 text-xs text-muted-foreground")}
            >
              <ChevronLeft className="h-3 w-3" />
              Назад
            </button>
            <p className="text-sm text-muted-foreground">
              Отправьте USDT (TRC20) на адрес ниже. Только сеть TRON.
            </p>
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <code className="flex-1 break-all font-mono text-xs">{depositAddress}</code>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 text-muted-foreground"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-positive" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
