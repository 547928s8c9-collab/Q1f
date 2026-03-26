import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp, Wallet, Shield, ChartLine, Loader2, Sparkles, Play } from "lucide-react";

const showDemoButtons = import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEMO_ENDPOINTS === "true";

export default function Landing() {
  const [, navigate] = useLocation();
  const [isDemoAdminLoading, setIsDemoAdminLoading] = useState(false);

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  const handleDemoLogin = () => {
    window.location.href = "/api/demo-login";
  };

  const handleDemoFlow = () => {
    navigate("/demo/sumsub");
  };
  
  const handleDemoAdmin = () => {
    setIsDemoAdminLoading(true);
    window.location.href = "/api/admin/auth/demo";
  };

  const features = [
    { icon: TrendingUp, title: "Портфель", desc: "Аналитика в реальном времени" },
    { icon: ChartLine, title: "Стратегии", desc: "Автоматизированные инвестиции" },
    { icon: Wallet, title: "Кошелёк", desc: "Мультивалютные операции" },
    { icon: Shield, title: "Безопасность", desc: "Банковский уровень защиты" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="container max-w-5xl mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm">
              <span className="text-primary-foreground font-bold text-sm">Z</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">ZEON</span>
          </div>
          <div className="flex items-center gap-2">
            {showDemoButtons && (
              <Button variant="ghost" size="sm" onClick={handleDemoLogin} data-testid="button-demo-header">
                Демо
              </Button>
            )}
            <Button size="sm" onClick={handleLogin} data-testid="button-login-header">
              Войти
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <section className="w-full max-w-2xl mx-auto py-20 md:py-32 text-center">
          <div className="inline-flex items-center gap-1.5 bg-primary/8 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            Умные инвестиции
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.08] mb-6">
            Приумножайте
            <br />
            <span className="text-primary">капитал</span>
          </h1>
          
          <p className="text-lg text-muted-foreground max-w-md mx-auto mb-10 leading-relaxed">
            Автоматизированные стратегии, прозрачная аналитика и безопасный кошелёк. Всё в одной платформе.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
            <Button size="lg" onClick={handleLogin} data-testid="button-get-started">
              Начать
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={handleDemoFlow} data-testid="button-try-demo">
              <Play className="mr-1.5 h-4 w-4" />
              Попробовать демо
            </Button>
          </div>

          {showDemoButtons && (
            <div className="flex gap-3 items-center justify-center mb-6">
              <Button size="sm" variant="ghost" onClick={handleDemoLogin} className="text-muted-foreground" data-testid="button-demo-access">
                Демо-вход (с данными)
              </Button>
            </div>
          )}
          
          {showDemoButtons && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleDemoAdmin} 
              disabled={isDemoAdminLoading}
              data-testid="button-demo-admin-access"
              className="text-muted-foreground"
            >
              {isDemoAdminLoading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Загрузка...
                </>
              ) : (
                "Демо Админ →"
              )}
            </Button>
          )}
        </section>

        <section className="w-full max-w-3xl mx-auto pb-20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="flex flex-col items-center text-center p-6 rounded-2xl bg-card shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div className="w-12 h-12 rounded-2xl bg-primary/8 flex items-center justify-center mb-3">
                  <f.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="py-6">
        <p className="text-center text-xs text-muted-foreground">
          ZEON — финтех-платформа для инвестиций
        </p>
      </footer>
    </div>
  );
}
