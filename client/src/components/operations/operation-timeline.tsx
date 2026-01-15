import { cn } from "@/lib/utils";
import { Check, Clock, X, Loader2 } from "lucide-react";

interface TimelineStep {
  label: string;
  status: "completed" | "current" | "pending" | "failed";
  timestamp?: string;
}

interface OperationTimelineProps {
  steps: TimelineStep[];
}

export function OperationTimeline({ steps }: OperationTimelineProps) {
  return (
    <div className="space-y-0">
      {steps.map((step, index) => (
        <div key={index} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                step.status === "completed" && "bg-positive/10 text-positive",
                step.status === "current" && "bg-primary/10 text-primary",
                step.status === "pending" && "bg-muted text-muted-foreground",
                step.status === "failed" && "bg-negative/10 text-negative"
              )}
            >
              {step.status === "completed" && <Check className="w-4 h-4" />}
              {step.status === "current" && <Loader2 className="w-4 h-4 animate-spin" />}
              {step.status === "pending" && <Clock className="w-4 h-4" />}
              {step.status === "failed" && <X className="w-4 h-4" />}
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "w-0.5 h-8",
                  step.status === "completed" ? "bg-positive/30" : "bg-border"
                )}
              />
            )}
          </div>

          <div className="pb-6">
            <p
              className={cn(
                "text-sm font-medium",
                step.status === "completed" && "text-foreground",
                step.status === "current" && "text-foreground",
                step.status === "pending" && "text-muted-foreground",
                step.status === "failed" && "text-negative"
              )}
            >
              {step.label}
            </p>
            {step.timestamp && (
              <p className="text-xs text-muted-foreground mt-0.5">{step.timestamp}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
