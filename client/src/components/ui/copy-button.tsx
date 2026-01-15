import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CopyButtonProps {
  value: string;
  size?: "sm" | "default" | "icon";
}

export function CopyButton({ value, size = "icon" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleCopy}
      data-testid="copy-button"
      className="h-8 w-8"
    >
      {copied ? (
        <Check className="w-4 h-4 text-positive" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
      <span className="sr-only">Copy</span>
    </Button>
  );
}
