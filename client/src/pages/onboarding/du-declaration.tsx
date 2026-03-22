import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Shield, AlertTriangle } from "lucide-react";
import {
  getSmartStartAnswers,
  calculateRecommendations,
  type SmartStartResult,
} from "@/lib/smart-start";

const profileTierMap: Record<string, { name: string; targetReturn: string; maxDrawdown: string }> = {
  "Conservative Investor": {
    name: "Консервативный портфель",
    targetReturn: "Целевая доходность: 5–10% в месяц",
    maxDrawdown: "Максимальная просадка: до 5%",
  },
  "Balanced Investor": {
    name: "Сбалансированный портфель",
    targetReturn: "Целевая доходность: 8–15% в месяц",
    maxDrawdown: "Максимальная просадка: до 10%",
  },
  "Growth Investor": {
    name: "Активный портфель",
    targetReturn: "Целевая доходность: 12–20% в месяц",
    maxDrawdown: "Максимальная просадка: до 15%",
  },
  "Aggressive Investor": {
    name: "Агрессивный портфель",
    targetReturn: "Целевая доходность: 20–40% в месяц",
    maxDrawdown: "Максимальная просадка: до 25%",
  },
};

export default function DuDeclaration() {
  const [, navigate] = useLocation();
  const [result, setResult] = useState<SmartStartResult | null>(null);
  const [accepted, setAccepted] = useState(false);

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
        <div className="animate-pulse text-muted-foreground">Загрузка...</div>
      </div>
    );
  }

  const tierInfo = profileTierMap[result.profile] ?? profileTierMap["Balanced Investor"];

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
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Декларация о рисках</h1>
          <p className="text-muted-foreground">
            Перед началом инвестирования ознакомьтесь с условиями управления
          </p>
        </div>

        <Card className="p-5 mb-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <h2 className="font-semibold text-lg mb-3">{tierInfo.name}</h2>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{tierInfo.targetReturn}</p>
            <p className="text-sm text-muted-foreground">{tierInfo.maxDrawdown}</p>
          </div>
        </Card>

        <div className="border border-border rounded-lg p-4 mb-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Управляющий (ОсОО «СтандартБизнесКонсалт») принимает все инвестиционные решения от вашего имени на основании Договора доверительного управления. Вы не управляете позициями самостоятельно — вы видите результат работы стратегии.
          </p>
        </div>

        <div className="border border-warning/30 rounded-lg p-4 mb-6 bg-warning/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Инвестиции в виртуальные активы сопряжены с риском полной потери вложенных средств. Прошлая доходность не гарантирует будущих результатов.
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3 mb-6">
          <Checkbox
            id="accept-declaration"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked === true)}
            data-testid="checkbox-du-declaration"
          />
          <Label htmlFor="accept-declaration" className="text-sm cursor-pointer leading-relaxed">
            Я ознакомился с условиями и принимаю декларацию о рисках
          </Label>
        </div>

        <Button
          className="w-full mb-4"
          size="lg"
          onClick={() => navigate("/onboarding/done")}
          disabled={!accepted}
          data-testid="button-confirm-declaration"
        >
          Подтвердить и продолжить
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Договор доверительного управления № ДУ-2026-XXXX
        </p>
      </main>
    </div>
  );
}
