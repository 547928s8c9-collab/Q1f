import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, TrendingDown, Info } from "lucide-react";

const riskFactors = [
  {
    title: "Market Volatility",
    level: "Medium",
    description: "Cryptocurrency markets can experience significant price fluctuations.",
    icon: TrendingDown,
  },
  {
    title: "Regulatory Risk",
    level: "Low",
    description: "We comply with all applicable regulations and maintain required licenses.",
    icon: Shield,
  },
  {
    title: "Liquidity Risk",
    level: "Low",
    description: "Assets are held in liquid markets with established trading volumes.",
    icon: Info,
  },
  {
    title: "Counterparty Risk",
    level: "Low",
    description: "We work only with established, regulated financial institutions.",
    icon: AlertTriangle,
  },
];

function getRiskColor(level: string) {
  switch (level) {
    case "Low":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "Medium":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "High":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function Risk() {
  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6" data-testid="risk-page">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Risk Disclosure</h1>
        <p className="text-muted-foreground">
          Understanding the risks associated with your investments.
        </p>
      </div>

      <Card data-testid="risk-overview-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Your Risk Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Based on your investment selections, here is an overview of the risk factors 
            that may affect your portfolio. We recommend reviewing this information 
            periodically and adjusting your strategy as needed.
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
            <strong>Disclaimer:</strong> This information is provided for educational purposes only 
            and does not constitute financial advice. Past performance is not indicative of future 
            results. All investments carry risk, and you may lose some or all of your invested capital. 
            Please consult with a qualified financial advisor before making investment decisions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
