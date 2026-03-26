import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DemoLayout } from "./demo-layout";
import { useDemo, deriveStrategy } from "./demo-context";

interface Question {
  text: string;
  options: string[];
}

const QUESTIONS: Question[] = [
  {
    text: "Какой у вас опыт инвестирования?",
    options: ["Нет опыта", "Менее 1 года", "1–3 года", "Более 3 лет"],
  },
  {
    text: "Как вы отнесётесь к падению портфеля на 20%?",
    options: ["Продам всё", "Буду переживать", "Подожду восстановления", "Докуплю на просадке"],
  },
  {
    text: "На какой срок вы планируете инвестировать?",
    options: ["До 3 месяцев", "3–6 месяцев", "6–12 месяцев", "Более 1 года"],
  },
  {
    text: "Какую долю сбережений готовы инвестировать?",
    options: ["До 10%", "10–25%", "25–50%", "Более 50%"],
  },
];

export default function DemoQuestionnaire() {
  const [, navigate] = useLocation();
  const { state, setAnswer, setStrategy } = useDemo();
  const [currentQ, setCurrentQ] = useState(0);

  const handleSelect = (optionIndex: number) => {
    setAnswer(currentQ, optionIndex);
    if (currentQ < QUESTIONS.length - 1) {
      setTimeout(() => setCurrentQ((q) => q + 1), 200);
    }
  };

  const allAnswered = Object.keys(state.answers).length === QUESTIONS.length;

  const handleContinue = () => {
    const strategy = deriveStrategy(state.answers);
    setStrategy(strategy);
    navigate("/demo/recommendation");
  };

  const q = QUESTIONS[currentQ];

  return (
    <DemoLayout>
      <div className="flex-1 flex flex-col gap-6">
        {/* Question counter */}
        <div className="flex gap-2">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i < currentQ
                  ? "bg-primary"
                  : i === currentQ
                    ? "bg-primary/50"
                    : "bg-muted",
              )}
            />
          ))}
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Вопрос {currentQ + 1} из {QUESTIONS.length}</p>
          <h2 className="text-lg font-semibold">{q.text}</h2>
        </div>

        <div className="space-y-3">
          {q.options.map((option, i) => (
            <Card
              key={i}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                state.answers[currentQ] === i && "ring-2 ring-primary",
              )}
              onClick={() => handleSelect(i)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0",
                    state.answers[currentQ] === i
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </div>
                <span className="text-sm">{option}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Navigation */}
        <div className="mt-auto flex gap-3">
          {currentQ > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setCurrentQ(currentQ - 1)}>
              Назад
            </Button>
          )}
          {allAnswered && (
            <Button className="flex-1" size="lg" onClick={handleContinue}>
              Узнать стратегию
            </Button>
          )}
        </div>
      </div>
    </DemoLayout>
  );
}
