import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sparkles, TrendingUp, Wallet, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSmartStartAnswers,
  calculateRecommendations,
  type SmartStartResult,
} from "@/lib/smart-start";

const tierColors = {
  LOW: "bg-positive/10 text-positive border-positive/20",
  CORE: "bg-primary/10 text-primary border-primary/20",
  HIGH: "bg-warning/10 text-warning border-warning/20",
};

const tierLabels = {
  LOW: "Low Risk",
  CORE: "Core",
  HIGH: "High Risk",
};

export default function SmartStartResults() {
  const [, navigate] = useLocation();
  const [result, setResult] = useState<SmartStartResult | null>(null);

  useEffect(() => {
    const answers = getSmartStartAnswers();
    if (!answers) {
      navigate("/onboarding/smart-start");
      return;
    }
    setResult(calculateRecommendations(answers));
  }, [navigate]);

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4">
          <span className="text-xl font-bold tracking-tight">ZEON</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 py-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Your Investment Plan</h1>
          <p className="text-muted-foreground">
            Based on your answers, you're a <span className="font-medium text-foreground">{result.profile}</span>
          </p>
        </div>

        <Card className="p-5 mb-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Suggested Starting Deposit</p>
              <p className="text-2xl font-bold">${result.suggestedDeposit} USDT</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            This amount is based on your risk profile and investment goals. You can always adjust later.
          </p>
        </Card>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Recommended Strategies</h2>
          </div>

          <div className="space-y-3">
            {result.recommendations.map((rec, index) => (
              <Card
                key={rec.strategyName}
                className="p-4"
                data-testid={`recommendation-${index}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{rec.strategyName}</h3>
                    <Badge variant="outline" className={cn("text-xs", tierColors[rec.riskTier])}>
                      {tierLabels[rec.riskTier]}
                    </Badge>
                  </div>
                  <span className="text-lg font-bold text-primary">{rec.allocation}%</span>
                </div>
                <Progress value={rec.allocation} className="h-2 mb-2" />
                <p className="text-sm text-muted-foreground">{rec.reason}</p>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-3 mt-auto">
          <Link href="/invest">
            <Button className="w-full" size="lg" data-testid="button-view-strategies">
              <Check className="w-4 h-4 mr-2" />
              View Strategies
            </Button>
          </Link>
          
          <Link href="/">
            <Button variant="outline" className="w-full" size="lg" data-testid="button-go-dashboard">
              Go to Dashboard
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
