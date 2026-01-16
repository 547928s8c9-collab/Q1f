import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, ArrowLeft, Sparkles, Target, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  questions,
  saveSmartStartAnswers,
  type RiskProfile,
  type TimeHorizon,
  type InvestmentGoal,
} from "@/lib/smart-start";

type Step = "riskProfile" | "timeHorizon" | "investmentGoal";

const stepConfig: Record<Step, { icon: typeof Target; title: string }> = {
  riskProfile: { icon: Target, title: "Risk Tolerance" },
  timeHorizon: { icon: Clock, title: "Time Horizon" },
  investmentGoal: { icon: TrendingUp, title: "Investment Goal" },
};

const steps: Step[] = ["riskProfile", "timeHorizon", "investmentGoal"];

export default function SmartStart() {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<{
    riskProfile?: RiskProfile;
    timeHorizon?: TimeHorizon;
    investmentGoal?: InvestmentGoal;
  }>({});

  const step = steps[currentStep];
  const question = questions[step];
  const Icon = stepConfig[step].icon;
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleSelect = (value: string) => {
    const newAnswers = { ...answers, [step]: value };
    setAnswers(newAnswers);

    if (currentStep < steps.length - 1) {
      setTimeout(() => setCurrentStep(currentStep + 1), 200);
    } else {
      saveSmartStartAnswers(newAnswers as {
        riskProfile: RiskProfile;
        timeHorizon: TimeHorizon;
        investmentGoal: InvestmentGoal;
      });
      navigate("/onboarding/smart-start/results");
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    navigate("/onboarding/done");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">ZEON</span>
          <Button variant="ghost" size="sm" onClick={handleSkip} data-testid="button-skip">
            Skip
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-primary">Smart Start</span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            Question {currentStep + 1} of {steps.length}
          </p>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {stepConfig[step].title}
              </p>
              <h1 className="text-xl font-semibold">{question.question}</h1>
            </div>
          </div>

          <div className="space-y-3">
            {question.options.map((option) => (
              <Card
                key={option.value}
                className={cn(
                  "p-4 cursor-pointer transition-all hover-elevate",
                  answers[step] === option.value && "ring-2 ring-primary bg-primary/5"
                )}
                onClick={() => handleSelect(option.value)}
                data-testid={`option-${option.value}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{option.label}</h3>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </Card>
            ))}
          </div>
        </div>

        {currentStep > 0 && (
          <Button
            variant="ghost"
            onClick={handleBack}
            className="mt-6"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        )}
      </main>
    </div>
  );
}
