import React, { Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { GateGuard } from "@/components/onboarding/gate-guard";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
const Analytics = React.lazy(() => import("@/pages/analytics"));
const Invest = React.lazy(() => import("@/pages/invest/index"));
const StrategyDetail = React.lazy(() => import("@/pages/invest/strategy-detail"));
const InvestConfirm = React.lazy(() => import("@/pages/invest/confirm"));
const Wallet = React.lazy(() => import("@/pages/wallet/index"));
const Vaults = React.lazy(() => import("@/pages/wallet/vaults"));
const DepositUSDT = React.lazy(() => import("@/pages/deposit/usdt"));
const DepositCard = React.lazy(() => import("@/pages/deposit/card"));
const Withdraw = React.lazy(() => import("@/pages/withdraw"));
const Activity = React.lazy(() => import("@/pages/activity/index"));
const ActivityEvents = React.lazy(() => import("@/pages/activity/events"));
const Receipt = React.lazy(() => import("@/pages/activity/receipt"));
const Settings = React.lazy(() => import("@/pages/settings/index"));
const SecuritySettings = React.lazy(() => import("@/pages/settings/security"));
const SettingsProfile = React.lazy(() => import("@/pages/settings/profile"));
const SettingsNotifications = React.lazy(() => import("@/pages/settings/notifications"));
const SettingsSupport = React.lazy(() => import("@/pages/settings/support"));
const Statements = React.lazy(() => import("@/pages/statements"));
const StatusPage = React.lazy(() => import("@/pages/status"));
const OnboardingWelcome = React.lazy(() => import("@/pages/onboarding/index"));
const OnboardingVerify = React.lazy(() => import("@/pages/onboarding/verify"));
const OnboardingConsent = React.lazy(() => import("@/pages/onboarding/consent"));
const OnboardingKyc = React.lazy(() => import("@/pages/onboarding/kyc"));
const OnboardingDone = React.lazy(() => import("@/pages/onboarding/done"));
const SmartStart = React.lazy(() => import("@/pages/onboarding/smart-start"));
const SmartStartResults = React.lazy(() => import("@/pages/onboarding/smart-start-results"));
const Inbox = React.lazy(() => import("@/pages/inbox"));
const Dashboard = React.lazy(() => import("@/pages/dashboard"));
const AdminKyc = React.lazy(() => import("@/pages/admin/kyc"));
const AdminWithdrawals = React.lazy(() => import("@/pages/admin/withdrawals"));
const AdminDashboard = React.lazy(() => import("@/pages/admin/dashboard"));
const TelegramMiniAppLegacy = React.lazy(() => import("@/pages/tg"));
const TelegramMiniAppV2 = React.lazy(() => import("@/pages/tg/v2"));
import { Loader2 } from "lucide-react";
import Risk from "@/pages/risk";

function ProtectedRouter() {
  return (
    <GateGuard>
      <AppShell>
        <Suspense
          fallback={(
            <div className="min-h-screen flex items-center justify-center bg-background">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
        >
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/risk" component={Risk} />
            <Route path="/analytics" component={Analytics} />
            <Route path="/invest" component={Invest} />
            <Route path="/invest/:id" component={StrategyDetail} />
            <Route path="/invest/:id/confirm" component={InvestConfirm} />
            <Route path="/wallet" component={Wallet} />
            <Route path="/wallet/vaults" component={Vaults} />
            <Route path="/deposit/usdt" component={DepositUSDT} />
            <Route path="/deposit/card" component={DepositCard} />
            <Route path="/withdraw" component={Withdraw} />
            <Route path="/activity" component={ActivityEvents} />
            <Route path="/activity/transactions" component={Activity} />
            <Route path="/activity/:operationId" component={Receipt} />
            <Route path="/settings" component={Settings} />
            <Route path="/settings/security" component={SecuritySettings} />
            <Route path="/settings/profile" component={SettingsProfile} />
            <Route path="/settings/notifications" component={SettingsNotifications} />
            <Route path="/settings/support" component={SettingsSupport} />
            <Route path="/statements" component={Statements} />
            <Route path="/status" component={StatusPage} />
            <Route path="/inbox" component={Inbox} />
            <Route path="/admin" component={AdminDashboard} />
            <Route path="/admin/dashboard" component={AdminDashboard} />
            <Route path="/admin/kyc" component={AdminKyc} />
            <Route path="/admin/withdrawals" component={AdminWithdrawals} />
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
          <Suspense
            fallback={(
              <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          >
            <Switch>
              <Route path="/tg" component={TelegramMiniAppV2} />
              <Route path="/tg/v2" component={TelegramMiniAppV2} />
              <Route path="/tg/legacy" component={TelegramMiniAppLegacy} />
              <Route path="/telegram" component={TelegramMiniAppV2} />
              <Route component={AuthenticatedApp} />
            </Switch>
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
