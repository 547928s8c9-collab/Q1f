import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Wallet, TrendingUp, Shield } from "lucide-react";

export default function OnboardingDone() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4">
          <span className="text-xl font-bold tracking-tight">ZEON</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full px-4 py-8">
        <div className="w-20 h-20 rounded-full bg-positive/20 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-positive" />
        </div>

        <h1 className="text-2xl font-bold mb-2 text-center">You're All Set!</h1>
        <p className="text-muted-foreground text-center mb-8">
          Your account is fully verified and ready to use
        </p>

        <div className="space-y-4 w-full mb-8">
          <Card className="p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Deposit Funds</h3>
              <p className="text-sm text-muted-foreground">
                Add USDT or RUB to start investing
              </p>
            </div>
          </Card>

          <Card className="p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Explore Strategies</h3>
              <p className="text-sm text-muted-foreground">
                Browse investment options and grow your portfolio
              </p>
            </div>
          </Card>

          <Card className="p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Secure Your Account</h3>
              <p className="text-sm text-muted-foreground">
                Enable 2FA and set up withdrawal whitelist
              </p>
            </div>
          </Card>
        </div>

        <Link href="/" className="w-full">
          <Button className="w-full" size="lg" data-testid="button-go-to-dashboard">
            Go to Dashboard
          </Button>
        </Link>
      </main>
    </div>
  );
}
