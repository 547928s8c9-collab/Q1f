import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { getProfileDisplayName, getProfileInitials } from "@/lib/profile";
import type { BootstrapResponse } from "@shared/schema";
import { Mail, UserRound, AlertCircle } from "lucide-react";

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}

function DetailRow({ icon, label, value, valueClassName }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-sm font-medium text-foreground ${valueClassName ?? ""}`}>{value}</p>
      </div>
    </div>
  );
}

export default function SettingsProfile() {
  useSetPageTitle("Profile");

  const {
    data: bootstrap,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const user = bootstrap?.user;
  const displayName = getProfileDisplayName(user);
  const initials = getProfileInitials(user);
  const email = user?.email?.trim() || "Email not provided";
  const firstName = user?.firstName?.trim() || "Not provided";
  const lastName = user?.lastName?.trim() || "Not provided";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader title="Profile" subtitle="Your account details" backHref="/settings" />

      {isLoading ? (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
          </Card>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : isError ? (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Unable to load profile</h3>
              <p className="text-sm text-muted-foreground">
                {(error as Error | undefined)?.message || "Please try again."}
              </p>
              <Button variant="secondary" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  {user?.profileImageUrl ? <AvatarImage src={user.profileImageUrl} /> : null}
                  <AvatarFallback className="text-sm bg-primary text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">{displayName}</h2>
                  <p className="text-sm text-muted-foreground">{email}</p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                ID: {user?.id ?? "—"}
              </div>
            </div>
          </Card>

          <section className="space-y-4">
            <SectionHeader title="Personal details" subtitle="Review the data on file" />
            <Card className="p-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <DetailRow icon={<UserRound className="h-4 w-4" />} label="First name" value={firstName} />
                <DetailRow icon={<UserRound className="h-4 w-4" />} label="Last name" value={lastName} />
                <DetailRow
                  icon={<Mail className="h-4 w-4" />}
                  label="Email"
                  value={email}
                  valueClassName="tabular-nums"
                />
              </div>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
