import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Shield, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useState } from "react";

type BannerType = "warning" | "info" | "danger";

interface Banner {
  id: string;
  type: BannerType;
  message: string;
  action?: {
    label: string;
    href: string;
  };
  dismissible?: boolean;
}

const bannerStyles: Record<BannerType, string> = {
  warning: "bg-warning/10 text-warning border-warning/20",
  info: "bg-primary/10 text-primary border-primary/20",
  danger: "bg-danger/10 text-danger border-danger/20",
};

const bannerIcons: Record<BannerType, typeof AlertTriangle> = {
  warning: AlertTriangle,
  info: Shield,
  danger: AlertTriangle,
};

export function GlobalBanner() {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const { data: bootstrap } = useQuery<{
    securitySettings?: {
      kycStatus?: string;
      twoFactorEnabled?: boolean;
    };
  }>({
    queryKey: ["/api/bootstrap"],
  });

  const banners: Banner[] = [];

  if (bootstrap?.securitySettings?.kycStatus === "not_started") {
    banners.push({
      id: "kyc-pending",
      type: "warning",
      message: "Complete identity verification to unlock all features",
      action: { label: "Verify now", href: "/settings/security" },
    });
  } else if (bootstrap?.securitySettings?.kycStatus === "in_review") {
    banners.push({
      id: "kyc-review",
      type: "info",
      message: "Your identity verification is being reviewed",
      dismissible: true,
    });
  } else if (bootstrap?.securitySettings?.kycStatus === "needs_action") {
    banners.push({
      id: "kyc-action",
      type: "danger",
      message: "Additional information required for verification",
      action: { label: "Update now", href: "/settings/security" },
    });
  }

  if (bootstrap?.securitySettings?.twoFactorEnabled === false) {
    banners.push({
      id: "2fa-disabled",
      type: "warning",
      message: "Enable two-factor authentication for better security",
      action: { label: "Enable 2FA", href: "/settings/security" },
      dismissible: true,
    });
  }

  const visibleBanners = banners.filter((b) => !dismissedIds.has(b.id));

  if (visibleBanners.length === 0) return null;

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  };

  return (
    <div className="space-y-0" data-testid="global-banner-container">
      {visibleBanners.map((banner) => {
        const Icon = bannerIcons[banner.type];
        return (
          <div
            key={banner.id}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 text-sm border-b",
              bannerStyles[banner.type]
            )}
            data-testid={`banner-${banner.id}`}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{banner.message}</span>
            {banner.action && (
              <Link href={banner.action.href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs font-medium"
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
                className="h-6 w-6"
                onClick={() => handleDismiss(banner.id)}
                data-testid={`button-dismiss-${banner.id}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
