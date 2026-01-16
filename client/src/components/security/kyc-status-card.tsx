import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { 
  ShieldCheck, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  ChevronRight,
  User
} from "lucide-react";
import { Link } from "wouter";

type KycStatus = "not_started" | "pending" | "in_review" | "approved" | "needs_action" | "rejected" | "on_hold";

interface KycStatusCardProps {
  status: KycStatus;
  onStartVerification?: () => void;
}

const statusConfig: Record<KycStatus, {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  chipVariant: "default" | "success" | "warning" | "danger" | "primary";
  chipText: string;
  showAction: boolean;
  actionText?: string;
}> = {
  not_started: {
    icon: User,
    title: "Identity Verification Required",
    description: "Complete verification to unlock all features including withdrawals and higher limits.",
    chipVariant: "warning",
    chipText: "Not Started",
    showAction: true,
    actionText: "Verify Now",
  },
  pending: {
    icon: Clock,
    title: "Verification Pending",
    description: "Your verification is pending. Please complete the verification process.",
    chipVariant: "default",
    chipText: "Pending",
    showAction: true,
    actionText: "Continue",
  },
  in_review: {
    icon: Clock,
    title: "Verification In Review",
    description: "We're reviewing your documents. This usually takes 1-2 business days.",
    chipVariant: "primary",
    chipText: "In Review",
    showAction: false,
  },
  approved: {
    icon: ShieldCheck,
    title: "Identity Verified",
    description: "Your identity has been verified. You have full access to all features.",
    chipVariant: "success",
    chipText: "Verified",
    showAction: false,
  },
  needs_action: {
    icon: AlertTriangle,
    title: "Action Required",
    description: "Additional information is needed to complete your verification.",
    chipVariant: "danger",
    chipText: "Action Required",
    showAction: true,
    actionText: "Update Now",
  },
  rejected: {
    icon: XCircle,
    title: "Verification Rejected",
    description: "Your verification was not approved. Please contact support for assistance.",
    chipVariant: "danger",
    chipText: "Rejected",
    showAction: true,
    actionText: "Contact Support",
  },
  on_hold: {
    icon: Clock,
    title: "Verification On Hold",
    description: "Your verification is on hold for manual review. We'll notify you of any updates.",
    chipVariant: "warning",
    chipText: "On Hold",
    showAction: false,
  },
};

export function KycStatusCard({ status, onStartVerification }: KycStatusCardProps) {
  const config = statusConfig[status] || statusConfig.not_started;
  const Icon = config.icon;

  const isVerified = status === "approved";
  const needsAction = status === "not_started" || status === "pending" || status === "needs_action";

  return (
    <Card 
      className={`p-5 ${isVerified ? 'border-success/30 bg-success/5' : needsAction ? 'border-warning/30 bg-warning/5' : ''}`}
      data-testid="card-kyc-status"
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
          isVerified ? 'bg-success/20' : 
          needsAction ? 'bg-warning/20' : 
          'bg-muted'
        }`}>
          <Icon className={`w-6 h-6 ${
            isVerified ? 'text-success' : 
            needsAction ? 'text-warning' : 
            'text-muted-foreground'
          }`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-base font-semibold text-foreground">{config.title}</h3>
            <Chip variant={config.chipVariant} size="sm" data-testid="chip-kyc-status">
              {config.chipText}
            </Chip>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{config.description}</p>

          {config.showAction && (
            <Button
              variant={needsAction ? "default" : "outline"}
              size="sm"
              onClick={onStartVerification}
              data-testid="button-kyc-action"
            >
              {config.actionText}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
