import { cn } from "@/lib/utils";
import { Delete } from "lucide-react";

interface NumericKeypadProps {
  onDigit: (digit: string) => void;
  onDecimal: () => void;
  onBackspace: () => void;
  className?: string;
}

function triggerHaptic() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

function KeypadButton({
  children,
  onPress,
  className,
}: {
  children: React.ReactNode;
  onPress: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center justify-center rounded-xl text-2xl font-medium",
        "h-14 active:bg-muted/80 active:scale-95 transition-transform duration-75",
        "select-none touch-manipulation",
        className,
      )}
      onClick={() => {
        triggerHaptic();
        onPress();
      }}
    >
      {children}
    </button>
  );
}

export function NumericKeypad({
  onDigit,
  onDecimal,
  onBackspace,
  className,
}: NumericKeypadProps) {
  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [".", "0", "backspace"],
  ];

  return (
    <div className={cn("grid grid-cols-3 gap-1", className)}>
      {keys.flat().map((key) => {
        if (key === "backspace") {
          return (
            <KeypadButton key={key} onPress={onBackspace} className="aria-label-backspace">
              <Delete className="h-6 w-6 text-muted-foreground" aria-label="Удалить" />
            </KeypadButton>
          );
        }
        if (key === ".") {
          return (
            <KeypadButton key={key} onPress={onDecimal}>
              .
            </KeypadButton>
          );
        }
        return (
          <KeypadButton key={key} onPress={() => onDigit(key)}>
            {key}
          </KeypadButton>
        );
      })}
    </div>
  );
}
