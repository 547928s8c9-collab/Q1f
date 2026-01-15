import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { AppShell } from "@/components/app-shell";
import NotFound from "@/pages/not-found";
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

function Router() {
  return (
    <AppShell>
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
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
