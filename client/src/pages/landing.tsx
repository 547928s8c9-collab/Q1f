import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, TrendingUp, Wallet, Shield, ChartLine } from "lucide-react";

// Check if demo endpoints should be shown
// Show demo buttons only if: NODE_ENV !== "production" AND ALLOW_DEMO_ENDPOINTS === "true"
const isDevMode = import.meta.env.MODE !== "production";
const allowDemoEndpoints = import.meta.env.VITE_ALLOW_DEMO_ENDPOINTS === "true";
const showDemoButtons = isDevMode && allowDemoEndpoints;

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };
  
  const handleDemoLogin = () => {
    window.location.href = "/api/demo-login";
  };
  
  const handleDemoAdmin = async () => {
    try {
      const res = await fetch("/api/admin/auth/demo", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        window.location.href = "/admin";
      } else {
        console.error("Demo admin login failed");
      }
    } catch (error) {
      console.error("Demo admin login error", error);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container max-w-6xl mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">Z</span>
            </div>
            <span className="text-xl font-semibold tracking-tight">ZEON</span>
          </div>
          <div className="flex items-center gap-2">
            {showDemoButtons && (
              <>
                <Button variant="outline" onClick={handleDemoLogin} data-testid="button-demo-header">
                  Demo
                </Button>
                <Button variant="outline" onClick={handleDemoAdmin} data-testid="button-demo-admin-header">
                  Demo Admin
                </Button>
              </>
            )}
            <Button onClick={handleLogin} data-testid="button-login-header">
              Login
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="container max-w-6xl mx-auto px-4 py-24 md:py-32">
          <div className="flex flex-col items-center text-center space-y-8">
            <div className="space-y-4 max-w-3xl">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                Grow Your Wealth with Smart Investing
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Professional-grade portfolio management, automated investment strategies, and secure multi-asset wallet. All in one platform.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <Button size="lg" onClick={handleLogin} data-testid="button-get-started">
                Login
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              {showDemoButtons && (
                <>
                  <Button size="lg" variant="outline" onClick={handleDemoLogin} data-testid="button-demo-access">
                    Demo
                  </Button>
                  <Button size="lg" variant="outline" onClick={handleDemoAdmin} data-testid="button-demo-admin-access">
                    Demo Admin
                  </Button>
                  <span className="text-xs text-muted-foreground">Dev only</span>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="container max-w-6xl mx-auto px-4 py-16">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <TrendingUp className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Portfolio Tracking</CardTitle>
                <CardDescription>
                  Real-time portfolio analytics with detailed performance charts
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <ChartLine className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Investment Strategies</CardTitle>
                <CardDescription>
                  Curated strategies with transparent performance metrics
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <Wallet className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Multi-Asset Wallet</CardTitle>
                <CardDescription>
                  Manage USDT and RUB with seamless deposits and withdrawals
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <Shield className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Bank-Grade Security</CardTitle>
                <CardDescription>
                  Two-factor authentication, address whitelisting, and more
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        <section className="container max-w-6xl mx-auto px-4 py-16">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="flex flex-col items-center text-center py-12 space-y-6">
              <h2 className="text-3xl font-bold">Ready to Start?</h2>
              <p className="text-muted-foreground max-w-lg">
                Join ZEON today and take control of your financial future with powerful tools and transparent investing.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <Button size="lg" onClick={handleLogin} data-testid="button-sign-in-cta">
                  Login
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                {showDemoButtons && (
                  <>
                    <Button size="lg" variant="outline" onClick={handleDemoLogin} data-testid="button-demo-cta">
                      Demo
                    </Button>
                    <Button size="lg" variant="outline" onClick={handleDemoAdmin} data-testid="button-demo-admin-cta">
                      Demo Admin
                    </Button>
                    <span className="text-xs text-muted-foreground">Dev only</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>ZEON Fintech Dashboard MVP</p>
        </div>
      </footer>
    </div>
  );
}
