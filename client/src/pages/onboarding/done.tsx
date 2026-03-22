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

        <h1 className="text-2xl font-bold mb-2 text-center">Всё готово!</h1>
        <p className="text-muted-foreground text-center mb-8">
          Ваш аккаунт полностью верифицирован и готов к использованию
        </p>

        <div className="space-y-4 w-full mb-8">
          <Card className="p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Пополнить счёт</h3>
              <p className="text-sm text-muted-foreground">
                Внесите USDT или RUB, чтобы начать инвестировать
              </p>
            </div>
          </Card>

          <Card className="p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Обзор стратегий</h3>
              <p className="text-sm text-muted-foreground">
                Просмотрите инвестиционные возможности и увеличьте свой портфель
              </p>
            </div>
          </Card>

          <Card className="p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Защитите аккаунт</h3>
              <p className="text-sm text-muted-foreground">
                Включите 2FA и настройте белый список для вывода средств
              </p>
            </div>
          </Card>
        </div>

        <Link href="/" className="w-full">
          <Button className="w-full" size="lg" data-testid="button-go-to-dashboard">
            Перейти на панель управления
          </Button>
        </Link>
      </main>
    </div>
  );
}
