import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, TrendingDown, Info } from "lucide-react";

const riskFactors = [
  {
    title: "Рыночная волатильность",
    level: "Средний",
    description: "Криптовалютные рынки могут испытывать значительные колебания цен.",
    icon: TrendingDown,
  },
  {
    title: "Регуляторный риск",
    level: "Низкий",
    description: "Мы соблюдаем все применимые нормативные требования и имеем необходимые лицензии.",
    icon: Shield,
  },
  {
    title: "Риск ликвидности",
    level: "Низкий",
    description: "Активы хранятся на ликвидных рынках с устоявшимися объёмами торгов.",
    icon: Info,
  },
  {
    title: "Контрагентный риск",
    level: "Низкий",
    description: "Мы работаем только с проверенными, регулируемыми финансовыми учреждениями.",
    icon: AlertTriangle,
  },
];

function getRiskColor(level: string) {
  switch (level) {
    case "Низкий":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "Средний":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "Высокий":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function Risk() {
  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6" data-testid="risk-page">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Раскрытие рисков</h1>
        <p className="text-muted-foreground">
          Понимание рисков, связанных с вашими инвестициями.
        </p>
      </div>

      <Card data-testid="risk-overview-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Ваш профиль риска
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            На основе ваших инвестиционных решений представлен обзор факторов риска, 
            которые могут повлиять на ваш портфель. Мы рекомендуем периодически 
            пересматривать эту информацию и корректировать стратегию по мере необходимости.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {riskFactors.map((factor, index) => (
          <Card key={index} data-testid={`risk-factor-${index}`}>
            <CardContent className="flex items-start gap-4 p-4">
              <div className="rounded-full bg-muted p-2">
                <factor.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{factor.title}</h3>
                  <Badge className={getRiskColor(factor.level)} data-testid={`risk-level-${index}`}>
                    {factor.level}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{factor.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card data-testid="risk-disclaimer-card">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            <strong>Отказ от ответственности:</strong> Данная информация предоставлена исключительно 
            в образовательных целях и не является финансовой рекомендацией. Прошлые результаты не 
            гарантируют будущей доходности. Все инвестиции сопряжены с риском, и вы можете потерять 
            часть или весь инвестированный капитал. Проконсультируйтесь с квалифицированным финансовым 
            консультантом перед принятием инвестиционных решений.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
