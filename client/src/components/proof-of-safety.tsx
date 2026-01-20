import { Shield, Lock, Eye, FileCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const safetyFeatures = [
  {
    icon: Shield,
    title: "Insured Assets",
    description: "Your funds are protected up to $250,000",
  },
  {
    icon: Lock,
    title: "Bank-Grade Security",
    description: "256-bit encryption and secure storage",
  },
  {
    icon: Eye,
    title: "Full Transparency",
    description: "Real-time portfolio tracking and reports",
  },
  {
    icon: FileCheck,
    title: "Regulatory Compliance",
    description: "Licensed and regulated operations",
  },
];

export function ProofOfSafety() {
  return (
    <Card data-testid="proof-of-safety-card">
      <CardHeader>
        <CardTitle className="text-lg">Your Safety Matters</CardTitle>
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
