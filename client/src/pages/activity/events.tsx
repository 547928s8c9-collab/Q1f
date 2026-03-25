import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { OperationRow } from "@/components/operations/operation-row";
import { OperationDetailsSheet } from "@/components/operations/operation-details-sheet";
import { BarChart2 } from "lucide-react";
import { type Operation } from "@shared/schema";
import { useState } from "react";

// ── page ───────────────────────────────────────────────────────────

export default function ActivityEvents() {
  useSetPageTitle("Активность");
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading } = useQuery<{ operations: Operation[]; nextCursor?: string }>({
    queryKey: ["/api/operations", { limit: 50 }],
    queryFn: async () => {
      const res = await fetch("/api/operations?limit=50", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch operations");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const operations = data?.operations ?? [];

  const handleOperationClick = (operation: Operation) => {
    setSelectedOperation(operation);
    setSheetOpen(true);
  };

  const handleSheetOpenChange = (open: boolean) => {
    setSheetOpen(open);
    if (!open) {
      setTimeout(() => setSelectedOperation(null), 300);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-2xl mx-auto pb-24">
        <h1 className="text-2xl font-bold mb-6">Активность</h1>
        <Card className="p-5">
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-2xl mx-auto pb-24" data-testid="activity-events-page">
      <h1 className="text-2xl font-bold mb-6">Активность</h1>

      {operations.length === 0 ? (
        <Card>
          <div
            className="flex flex-col items-center justify-center text-center py-12 px-6"
            data-testid="empty-state"
          >
            <div className="text-4xl mb-4"><BarChart2 className="w-10 h-10 text-muted-foreground mx-auto" /></div>
            <h3 className="text-lg font-medium mb-1" data-testid="text-empty-title">
              Активность появится после первого расчётного дня
            </h3>
            <p className="text-sm text-muted-foreground" data-testid="text-empty-description">
              Результаты управления публикуются ежедневно
            </p>
          </div>
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {operations.map((operation) => (
            <OperationRow
              key={operation.id}
              operation={operation}
              onClick={() => handleOperationClick(operation)}
            />
          ))}
        </Card>
      )}

      <OperationDetailsSheet
        operation={selectedOperation}
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
      />
    </div>
  );
}
