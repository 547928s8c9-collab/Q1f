import { Link } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingLayoutProps {
  currentStep: number;
  totalSteps: number;
  children: React.ReactNode;
}

const stepLabels = ["Verify", "Consent", "Identity"];

export function OnboardingLayout({ currentStep, totalSteps, children }: OnboardingLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <span className="text-xl font-bold tracking-tight">ZEON</span>
          </Link>
          <span className="text-sm text-muted-foreground">
            Step {currentStep} of {totalSteps}
          </span>
        </div>
      </header>

      <div className="max-w-lg mx-auto w-full px-4 pt-6">
        <div className="flex items-center justify-between mb-8">
          {stepLabels.map((label, index) => {
            const stepNum = index + 1;
            const isCompleted = stepNum < currentStep;
            const isCurrent = stepNum === currentStep;

            return (
              <div key={label} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                      isCompleted && "bg-positive text-positive-foreground",
                      isCurrent && "bg-primary text-primary-foreground",
                      !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                    )}
                    data-testid={`step-indicator-${stepNum}`}
                  >
                    {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : stepNum}
                  </div>
                  <span
                    className={cn(
                      "text-xs mt-2",
                      isCurrent ? "text-foreground font-medium" : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </span>
                </div>
                {index < stepLabels.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 mx-2 -mt-6",
                      stepNum < currentStep ? "bg-positive" : "bg-muted"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <main className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 pb-8">
        {children}
      </main>
    </div>
  );
}
