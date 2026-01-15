import { Switch } from "@/components/ui/switch";
import { ChevronRight } from "lucide-react";

interface SecuritySettingRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  value?: boolean;
  onChange?: (value: boolean) => void;
  onClick?: () => void;
  type?: "toggle" | "action";
  disabled?: boolean;
}

export function SecuritySettingRow({
  icon,
  label,
  description,
  value,
  onChange,
  onClick,
  type = "toggle",
  disabled = false,
}: SecuritySettingRowProps) {
  const content = (
    <div className="flex items-center gap-4 p-4 rounded-lg hover-elevate transition-colors">
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {type === "toggle" && onChange && (
        <Switch
          checked={value}
          onCheckedChange={onChange}
          disabled={disabled}
          data-testid={`toggle-${label.toLowerCase().replace(/\s+/g, "-")}`}
        />
      )}

      {type === "action" && (
        <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      )}
    </div>
  );

  if (type === "action" && onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left cursor-pointer"
        data-testid={`action-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {content}
      </button>
    );
  }

  return content;
}
