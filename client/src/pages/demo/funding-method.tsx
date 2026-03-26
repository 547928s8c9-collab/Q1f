import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreditCard, Bitcoin } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoLayout } from "./demo-layout";
import { useDemo, type FundingMethod } from "./demo-context";

const METHODS: { key: FundingMethod; icon: typeof CreditCard; title: string; desc: string }[] = [
  {
    key: "card",
    icon: CreditCard,
    title: "Банковская карта",
    desc: "Visa, Mastercard, МИР. Моментальное зачисление",
  },
  {
    key: "crypto",
    icon: Bitcoin,
    title: "Криптовалюта",
    desc: "USDT TRC-20 / ERC-20. Зачисление за 1–5 минут",
  },
];

export default function DemoFundingMethod() {
  const [, navigate] = useLocation();
  const { state, setFundingMethod } = useDemo();

  return (
    <DemoLayout>
      <div className="flex-1 flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Способ пополнения</h2>
          <p className="text-sm text-muted-foreground">Выберите удобный способ внесения средств</p>
        </div>

        <div className="space-y-3">
          {METHODS.map((m) => (
            <Card
              key={m.key}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                state.fundingMethod === m.key && "ring-2 ring-primary",
              )}
              onClick={() => setFundingMethod(m.key)}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/8 flex items-center justify-center shrink-0">
                  <m.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{m.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-auto">
          <Button
            className="w-full"
            size="lg"
            disabled={!state.fundingMethod}
            onClick={() => navigate("/demo/deposit")}
          >
            Продолжить
          </Button>
        </div>
      </div>
    </DemoLayout>
  );
}
