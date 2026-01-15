import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import type { BootstrapResponse } from "@shared/schema";
import { Loader2 } from "lucide-react";

interface GateGuardProps {
  children: React.ReactNode;
}

export function GateGuard({ children }: GateGuardProps) {
  const { data: bootstrap, isLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bootstrap) {
    return <Redirect to="/" />;
  }

  const { stage } = bootstrap.onboarding;

  if (stage === "verify") {
    return <Redirect to="/onboarding/verify" />;
  }

  if (stage === "consent") {
    return <Redirect to="/onboarding/consent" />;
  }

  if (stage === "kyc") {
    return <Redirect to="/onboarding/kyc" />;
  }

  return <>{children}</>;
}
