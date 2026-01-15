import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Shield, TrendingUp } from "lucide-react";
import type { BootstrapResponse } from "@shared/schema";

export default function OnboardingWelcome() {
  const { data: bootstrap } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const firstName = bootstrap?.user?.firstName || "there";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4">
          <span className="text-xl font-bold tracking-tight">ZEON</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Welcome, {firstName}!</h1>
          <p className="text-muted-foreground">
            Let's get your account set up so you can start investing.
          </p>
        </div>

        <div className="space-y-4 w-full mb-8">
          <Card className="p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Secure Verification</h3>
              <p className="text-sm text-muted-foreground">
                Verify your identity to protect your account
              </p>
            </div>
          </Card>

          <Card className="p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Quick Setup</h3>
              <p className="text-sm text-muted-foreground">
                Takes just a few minutes to complete
              </p>
            </div>
          </Card>

          <Card className="p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Start Investing</h3>
              <p className="text-sm text-muted-foreground">
                Access all features once verified
              </p>
            </div>
          </Card>
        </div>

        <Link href="/onboarding/verify" className="w-full">
          <Button className="w-full" size="lg" data-testid="button-start-onboarding">
            Get Started
          </Button>
        </Link>
      </main>
    </div>
  );
}
