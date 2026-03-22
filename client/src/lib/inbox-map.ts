import { 
  ArrowUpDown, 
  ShieldCheck, 
  UserCheck, 
  Info,
  TrendingUp,
  AlertTriangle,
  type LucideIcon 
} from "lucide-react";
import type { NotificationTypeValue } from "@shared/schema";

export interface InboxTypeConfig {
  icon: LucideIcon;
  label: string;
  variant: "default" | "success" | "warning" | "danger" | "primary";
  bgColor: string;
  iconColor: string;
}

export const inboxTypeMap: Record<NotificationTypeValue | string, InboxTypeConfig> = {
  transaction: {
    icon: ArrowUpDown,
    label: "Транзакция",
    variant: "primary",
    bgColor: "bg-primary/10",
    iconColor: "text-primary",
  },
  kyc: {
    icon: UserCheck,
    label: "Верификация",
    variant: "warning",
    bgColor: "bg-warning/10",
    iconColor: "text-warning",
  },
  security: {
    icon: ShieldCheck,
    label: "Безопасность",
    variant: "danger",
    bgColor: "bg-destructive/10",
    iconColor: "text-destructive",
  },
  system: {
    icon: Info,
    label: "Система",
    variant: "default",
    bgColor: "bg-muted",
    iconColor: "text-muted-foreground",
  },
  investment: {
    icon: TrendingUp,
    label: "Инвестиция",
    variant: "success",
    bgColor: "bg-positive/10",
    iconColor: "text-positive",
  },
  risk: {
    icon: AlertTriangle,
    label: "Предупреждение о риске",
    variant: "warning",
    bgColor: "bg-warning/10",
    iconColor: "text-warning",
  },
};

export function getInboxConfig(type: NotificationTypeValue | string): InboxTypeConfig {
  return inboxTypeMap[type] || inboxTypeMap.system;
}
