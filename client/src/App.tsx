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
import Analytics from "@/pages/analytics";
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
import SettingsProfile from "@/pages/settings/profile";
import Statements from "@/pages/statements";
import StatusPage from "@/pages/status";
import OnboardingWelcome from "@/pages/onboarding/index";
import OnboardingVerify from "@/pages/onboarding/verify";
import OnboardingConsent from "@/pages/onboarding/consent";
import OnboardingKyc from "@/pages/onboarding/kyc";
import OnboardingDone from "@/pages/onboarding/done";
import SmartStart from "@/pages/onboarding/smart-start";
import SmartStartResults from "@/pages/onboarding/smart-start-results";
import Inbox from "@/pages/inbox";
import Dashboard from "@/pages/dashboard";
import AdminKyc from "@/pages/admin/kyc";
import AdminWithdrawals from "@/pages/admin/withdrawals";
import AdminDashboard from "@/pages/admin/dashboard";
import TelegramMiniApp from "@/pages/tg";
import { Loader2 } from "lucide-react";

function ProtectedRouter() {
  return (
    <GateGuard>
      <AppShell>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/dashboard" component={Dashboard} />
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
          <Route path="/settings/profile" component={SettingsProfile} />
          <Route path="/settings" component={Settings} />
          <Route path="/settings/security" component={SecuritySettings} />
          <Route path="/statements" component={Statements} />
          <Route path="/status" component={StatusPage} />
          <Route path="/inbox" component={Inbox} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/dashboard" component={AdminDashboard} />
          <Route path="/admin/kyc" component={AdminKyc} />
          <Route path="/admin/withdrawals" component={AdminWithdrawals} />
          <Route component={NotFound} />
        </Switch>
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
          <Switch>
            <Route path="/tg" component={TelegramMiniApp} />
            <Route path="/telegram" component={TelegramMiniApp} />
            <Route component={AuthenticatedApp} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
