import { Switch, Route } from "wouter";
import { Suspense, lazy } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { GateGuard } from "@/components/onboarding/gate-guard";
import { Skeleton } from "@/components/ui/loading-skeleton";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Invest from "@/pages/invest/index";
import StrategyDetail from "@/pages/invest/strategy-detail";
import InvestConfirm from "@/pages/invest/confirm";
import Wallet from "@/pages/wallet/index";
import Vaults from "@/pages/wallet/vaults";
import DepositUSDT from "@/pages/deposit/usdt";
import DepositCard from "@/pages/deposit/card";
import Withdraw from "@/pages/withdraw";
import Activity from "@/pages/activity/index";
import Receipt from "@/pages/activity/receipt";
import Settings from "@/pages/settings/index";
import SecuritySettings from "@/pages/settings/security";
import OnboardingWelcome from "@/pages/onboarding/index";
import OnboardingVerify from "@/pages/onboarding/verify";
import OnboardingConsent from "@/pages/onboarding/consent";
import OnboardingKyc from "@/pages/onboarding/kyc";
import OnboardingDone from "@/pages/onboarding/done";
import SmartStart from "@/pages/onboarding/smart-start";
import SmartStartResults from "@/pages/onboarding/smart-start-results";
import Inbox from "@/pages/inbox";
import StatusPage from "@/pages/status";
import UIKit from "@/pages/ui-kit";
import { Loader2 } from "lucide-react";

const Analytics = lazy(() => import("@/pages/analytics"));
const Statements = lazy(() => import("@/pages/statements"));
const LiveSessions = lazy(() => import("@/pages/live-sessions/index"));
const LiveSessionDetail = lazy(() => import("@/pages/live-sessions/detail"));
const LiveSessionPage = lazy(() => import("@/pages/live-sessions/session"));
const AdminKycPage = lazy(() => import("@/pages/admin/kyc"));
const AdminWithdrawalsPage = lazy(() => import("@/pages/admin/withdrawals"));

function RouteFallback() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto pb-24 space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-64 w-full" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

function ProtectedRouter() {
  return (
    <GateGuard>
      <AppShell>
        <Suspense fallback={<RouteFallback />}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/analytics" component={Analytics} />
            <Route path="/invest" component={Invest} />
            <Route path="/invest/:id" component={StrategyDetail} />
            <Route path="/invest/:id/confirm" component={InvestConfirm} />
            <Route path="/wallet" component={Wallet} />
            <Route path="/wallet/vaults" component={Vaults} />
            <Route path="/deposit/usdt" component={DepositUSDT} />
            <Route path="/deposit/card" component={DepositCard} />
            <Route path="/withdraw" component={Withdraw} />
            <Route path="/activity" component={Activity} />
            <Route path="/activity/:operationId" component={Receipt} />
            <Route path="/settings" component={Settings} />
            <Route path="/settings/security" component={SecuritySettings} />
            <Route path="/statements" component={Statements} />
            <Route path="/status" component={StatusPage} />
            <Route path="/inbox" component={Inbox} />
            <Route path="/live-sessions" component={LiveSessions} />
            <Route path="/live-sessions/session/:id" component={LiveSessionPage} />
            <Route path="/live-sessions/:slug" component={LiveSessionDetail} />
            <Route path="/admin/kyc" component={AdminKycPage} />
            <Route path="/admin/withdrawals" component={AdminWithdrawalsPage} />
            <Route path="/ui-kit" component={UIKit} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </AppShell>
    </GateGuard>
  );
}

function OnboardingRouter() {
  return (
    <Switch>
      <Route path="/onboarding" component={OnboardingWelcome} />
      <Route path="/onboarding/verify" component={OnboardingVerify} />
      <Route path="/onboarding/consent" component={OnboardingConsent} />
      <Route path="/onboarding/kyc" component={OnboardingKyc} />
      <Route path="/onboarding/smart-start" component={SmartStart} />
      <Route path="/onboarding/smart-start/results" component={SmartStartResults} />
      <Route path="/onboarding/done" component={OnboardingDone} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  return (
    <Switch>
      <Route path="/onboarding/smart-start/results" component={SmartStartResults} />
      <Route path="/onboarding/smart-start" component={SmartStart} />
      <Route path="/onboarding/:rest*" component={OnboardingRouter} />
      <Route component={ProtectedRouter} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AuthenticatedApp />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
