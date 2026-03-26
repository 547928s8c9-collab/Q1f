import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DemoLayout } from "./demo-layout";
import { useDemo, STRATEGIES, type StrategyType } from "./demo-context";

export default function DemoRecommendation() {
  const [, navigate] = useLocation();
  const { state, setStrategy } = useDemo();

  // Navigation guard: require questionnaire answers
  useEffect(() => {
    if (Object.keys(state.answers).length === 0) {
      navigate("/demo/questionnaire", { replace: true });
    }
  }, [state.answers, navigate]);

  const recommended = state.strategy || "active";

  return (
    <DemoLayout>
      <div className="flex-1 flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Ваша стратегия</h2>
          <p className="text-sm text-muted-foreground">
            На основе ваших ответов мы подобрали оптимальную стратегию
          </p>
        </div>

        <div className="space-y-3">
          {(Object.entries(STRATEGIES) as [StrategyType, typeof STRATEGIES[StrategyType]][]).map(
            ([key, s]) => {
              const isRecommended = key === recommended;
              return (
                <Card
                  key={key}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md relative",
                    state.strategy === key && `ring-2 ${s.border} ring-offset-1`,
                    isRecommended && "shadow-md",
                  )}
                  onClick={() => setStrategy(key)}
                >
                  {isRecommended && (
                    <div className={cn("absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide", s.bg, s.color)}>
                      Рекомендуем
                    </div>
                  )}
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-2xl", s.bg)}>
                        {s.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{s.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{s.description}</p>
                        <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", s.bg, s.color)}>
                          {s.rateMin}–{s.rateMax}% / мес
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            },
          )}
        </div>

        <div className="mt-auto">
          <Button className="w-full" size="lg" onClick={() => navigate("/demo/funding")}>
            Выбрать и продолжить
          </Button>
        </div>
      </div>
    </DemoLayout>
  );
}
