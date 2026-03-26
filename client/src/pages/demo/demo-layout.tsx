import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const STEPS = [
  { path: "sumsub", label: "Верификация" },
  { path: "register", label: "Регистрация" },
  { path: "questionnaire", label: "Опросник" },
  { path: "recommendation", label: "Стратегия" },
  { path: "funding", label: "Пополнение" },
  { path: "deposit", label: "Депозит" },
  { path: "portfolio", label: "Портфель" },
];

function getStepIndex(pathname: string): number {
  const slug = pathname.split("/").pop() || "";
  const idx = STEPS.findIndex((s) => s.path === slug);
  return idx >= 0 ? idx : 0;
}

export function DemoLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const currentStep = getStepIndex(location);
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  const handleBack = () => {
    if (currentStep === 0) {
      navigate("/");
    } else {
      navigate(`/demo/${STEPS[currentStep - 1].path}`);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
        <div className="container max-w-lg mx-auto flex h-14 items-center gap-3 px-4">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium truncate">{STEPS[currentStep]?.label}</span>
              <span className="text-xs text-muted-foreground">{currentStep + 1}/{STEPS.length}</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col">
        <div className="container max-w-lg mx-auto flex-1 flex flex-col px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
