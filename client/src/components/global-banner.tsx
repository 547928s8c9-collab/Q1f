import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Shield, X, UserCheck, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useState } from "react";

type BannerType = "warning" | "info" | "danger" | "kyc";

interface Banner {
  id: string;
  type: BannerType;
  message: string;
  action?: {
    label: string;
    href: string;
  };
  dismissible?: boolean;
  priority?: number;
}

const bannerStyles: Record<BannerType, string> = {
  warning: "bg-warning/10 text-warning border-warning/20",
  info: "bg-primary/10 text-primary border-primary/20",
  danger: "bg-danger/10 text-danger border-danger/20",
  kyc: "bg-gradient-to-r from-warning/15 to-primary/10 text-foreground border-warning/30",
};

const bannerIcons: Record<BannerType, typeof AlertTriangle> = {
  warning: AlertTriangle,
  info: Shield,
  danger: AlertCircle,
  kyc: UserCheck,
};

export function GlobalBanner() {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const { data: bootstrap } = useQuery<{
    security?: {
      kycStatus?: string;
      twoFactorEnabled?: boolean;
    };
  }>({
    queryKey: ["/api/bootstrap"],
  });

  const banners: Banner[] = [];
  const kycStatus = bootstrap?.security?.kycStatus;

  if (kycStatus === "not_started" || kycStatus === "pending") {
    banners.push({
      id: "kyc-verify",
      type: "kyc",
      message: "Complete identity verification to unlock withdrawals and higher limits",
      action: { label: "Verify", href: "/settings/security" },
      priority: 1,
    });
  } else if (kycStatus === "in_review") {
    banners.push({
      id: "kyc-review",
      type: "info",
      message: "Your verification is being reviewed. This usually takes 1-2 business days.",
      dismissible: true,
      priority: 2,
    });
  } else if (kycStatus === "needs_action") {
    banners.push({
      id: "kyc-action",
      type: "danger",
      message: "Action required: Additional information needed for verification",
      action: { label: "Update Now", href: "/settings/security" },
      priority: 1,
    });
  } else if (kycStatus === "rejected") {
    banners.push({
      id: "kyc-rejected",
      type: "danger",
      message: "Your verification was not approved. Please contact support.",
      action: { label: "Contact Support", href: "/settings/security" },
      priority: 1,
    });
  } else if (kycStatus === "on_hold") {
    banners.push({
      id: "kyc-hold",
      type: "warning",
      message: "Your verification is on hold for manual review",
      dismissible: true,
      priority: 2,
    });
  }

  if (bootstrap?.security?.twoFactorEnabled === false && kycStatus === "approved") {
    banners.push({
      id: "2fa-disabled",
      type: "warning",
      message: "Protect your account with two-factor authentication",
      action: { label: "Enable 2FA", href: "/settings/security" },
      dismissible: true,
      priority: 3,
    });
  }

  const visibleBanners = banners
    .filter((b) => !dismissedIds.has(b.id))
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  if (visibleBanners.length === 0) return null;

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  };

  return (
    <div className="space-y-0" data-testid="global-banner-container">
      {visibleBanners.map((banner) => {
        const Icon = bannerIcons[banner.type];
        const isKycBanner = banner.type === "kyc";
        
        return (
          <div
            key={banner.id}
            className={cn(
              "flex items-center gap-3 px-4 py-3 text-sm border-b",
              bannerStyles[banner.type]
            )}
            data-testid={`banner-${banner.id}`}
          >
            <div className={cn(
              "flex items-center justify-center rounded-full flex-shrink-0",
              isKycBanner ? "w-8 h-8 bg-warning/20" : ""
            )}>
              <Icon className={cn(
                "flex-shrink-0",
                isKycBanner ? "h-4 w-4 text-warning" : "h-4 w-4"
              )} />
            </div>
            <span className="flex-1 font-medium">{banner.message}</span>
            {banner.action && (
              <Link href={banner.action.href}>
                <Button
                  variant={isKycBanner || banner.type === "danger" ? "default" : "outline"}
                  size="sm"
                  className="font-semibold"
                  data-testid={`button-banner-action-${banner.id}`}
                >
                  {banner.action.label}
                </Button>
              </Link>
            )}
            {banner.dismissible && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleDismiss(banner.id)}
                data-testid={`button-dismiss-${banner.id}`}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
