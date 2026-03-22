import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, TrendingUp, Wallet, Shield, ChartLine, Loader2 } from "lucide-react";

const showDemoButtons = import.meta.env.VITE_ALLOW_DEMO_ENDPOINTS === "true";

export default function Landing() {
  const [isDemoAdminLoading, setIsDemoAdminLoading] = useState(false);

  const handleLogin = () => {
    window.location.href = "/api/login";
  };
  
  const handleDemoLogin = () => {
    window.location.href = "/api/demo-login";
  };
  
  const handleDemoAdmin = () => {
    setIsDemoAdminLoading(true);
    window.location.href = "/api/admin/auth/demo";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container max-w-6xl mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">Z</span>
            </div>
            <span className="text-xl font-semibold tracking-tight">ZEON</span>
          </div>
          <div className="flex items-center gap-2">
            {showDemoButtons && (
              <>
                <Button variant="outline" onClick={handleDemoLogin} data-testid="button-demo-header">
                  Попробовать демо →
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleDemoAdmin} 
                  disabled={isDemoAdminLoading}
                  data-testid="button-demo-admin-header"
                >
                  {isDemoAdminLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Загрузка...
                    </>
                  ) : (
                    "Демо Админ"
                  )}
                </Button>
              </>
            )}
            <Button onClick={handleLogin} data-testid="button-login-header">
              Войти
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="container max-w-6xl mx-auto px-4 py-24 md:py-32">
          <div className="flex flex-col items-center text-center space-y-8">
            <div className="space-y-4 max-w-3xl">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                Приумножайте капитал с умным инвестированием
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Профессиональное управление портфелем, автоматизированные инвестиционные стратегии и безопасный мультивалютный кошелёк. Всё в одной платформе.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <Button size="lg" onClick={handleLogin} data-testid="button-get-started">
                Войти
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              {showDemoButtons && (
                <>
                  <Button size="lg" variant="outline" onClick={handleDemoLogin} data-testid="button-demo-access">
                    Попробовать демо →
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline" 
                    onClick={handleDemoAdmin} 
                    disabled={isDemoAdminLoading}
                    data-testid="button-demo-admin-access"
                  >
                    {isDemoAdminLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Загрузка...
                      </>
                    ) : (
                      "Демо Админ"
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">Только для разработки</span>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="container max-w-6xl mx-auto px-4 py-16">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <TrendingUp className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Отслеживание портфеля</CardTitle>
                <CardDescription>
                  Аналитика портфеля в реальном времени с подробными графиками доходности
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <ChartLine className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Инвестиционные стратегии</CardTitle>
                <CardDescription>
                  Проверенные стратегии с прозрачными показателями эффективности
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <Wallet className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Мультивалютный кошелёк</CardTitle>
                <CardDescription>
                  Управляйте USDT и RUB с удобными депозитами и выводами
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <Shield className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Банковская безопасность</CardTitle>
                <CardDescription>
                  Двухфакторная аутентификация, белый список адресов и многое другое
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        <section className="container max-w-6xl mx-auto px-4 py-16">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="flex flex-col items-center text-center py-12 space-y-6">
              <h2 className="text-3xl font-bold">Готовы начать?</h2>
              <p className="text-muted-foreground max-w-lg">
                Присоединяйтесь к ZEON сегодня и возьмите под контроль своё финансовое будущее с мощными инструментами и прозрачным инвестированием.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <Button size="lg" onClick={handleLogin} data-testid="button-sign-in-cta">
                  Войти
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                {showDemoButtons && (
                  <>
                    <Button size="lg" variant="outline" onClick={handleDemoLogin} data-testid="button-demo-cta">
                      Попробовать демо →
                    </Button>
                    <Button 
                      size="lg" 
                      variant="outline" 
                      onClick={handleDemoAdmin} 
                      disabled={isDemoAdminLoading}
                      data-testid="button-demo-admin-cta"
                    >
                      {isDemoAdminLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Загрузка...
                        </>
                      ) : (
                        "Демо Админ"
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">Только для разработки</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>ZEON — финтех-платформа для инвестиций</p>
        </div>
      </footer>
    </div>
  );
}
