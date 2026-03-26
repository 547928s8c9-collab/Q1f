import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, ScanLine } from "lucide-react";
import { DemoLayout } from "./demo-layout";

type Phase = "idle" | "scanning" | "done";

export default function DemoSumsub() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [scanProgress, setScanProgress] = useState(0);

  useEffect(() => {
    if (phase !== "scanning") return;
    const interval = setInterval(() => {
      setScanProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setPhase("done");
          return 100;
        }
        return p + 2;
      });
    }, 40);
    return () => clearInterval(interval);
  }, [phase]);

  return (
    <DemoLayout>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
        <div className="relative w-64 h-40 rounded-2xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-muted/30">
          {/* Document placeholder */}
          <div className="absolute inset-4 rounded-xl bg-card border shadow-sm flex flex-col items-start justify-center px-4 gap-1.5">
            <div className="w-10 h-10 rounded-lg bg-muted" />
            <div className="w-24 h-2 rounded bg-muted" />
            <div className="w-32 h-2 rounded bg-muted" />
            <div className="w-20 h-2 rounded bg-muted" />
          </div>

          {/* Scanning animation */}
          {phase === "scanning" && (
            <div
              className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_2px_hsl(var(--primary)/0.5)] transition-all duration-75"
              style={{ top: `${scanProgress}%` }}
            />
          )}

          {/* Done overlay */}
          {phase === "done" && (
            <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center backdrop-blur-[1px]">
              <CheckCircle2 className="h-12 w-12 text-green-500 animate-in zoom-in-50 duration-300" />
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">Верификация личности</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            {phase === "idle" && "Сканируйте документ для подтверждения личности"}
            {phase === "scanning" && "Сканирование документа..."}
            {phase === "done" && "Документ успешно проверен!"}
          </p>
        </div>

        {phase === "idle" && (
          <Button size="lg" onClick={() => setPhase("scanning")}>
            <ScanLine className="mr-2 h-4 w-4" />
            Начать сканирование
          </Button>
        )}

        {phase === "scanning" && (
          <div className="w-48">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-100 rounded-full"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">{scanProgress}%</p>
          </div>
        )}

        {phase === "done" && (
          <Button size="lg" onClick={() => navigate("/demo/register")}>
            Продолжить
          </Button>
        )}
      </div>
    </DemoLayout>
  );
}
