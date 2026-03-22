import { Shield, Lock, Eye, FileCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const safetyFeatures = [
  {
    icon: Shield,
    title: "Застрахованные активы",
    description: "Ваши средства защищены на сумму до $250 000",
  },
  {
    icon: Lock,
    title: "Банковский уровень безопасности",
    description: "256-битное шифрование и безопасное хранение",
  },
  {
    icon: Eye,
    title: "Полная прозрачность",
    description: "Отслеживание портфеля и отчёты в реальном времени",
  },
  {
    icon: FileCheck,
    title: "Соответствие нормативам",
    description: "Лицензированная и регулируемая деятельность",
  },
];

export function ProofOfSafety() {
  return (
    <Card data-testid="proof-of-safety-card">
      <CardHeader>
        <CardTitle className="text-lg">Ваша безопасность важна</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {safetyFeatures.map((feature, index) => (
            <div
              key={index}
              className="flex items-start gap-3"
              data-testid={`safety-feature-${index}`}
            >
              <div className="rounded-full bg-muted p-2" data-testid={`safety-icon-${index}`}>
                <feature.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{feature.title}</p>
                <p className="text-xs text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
