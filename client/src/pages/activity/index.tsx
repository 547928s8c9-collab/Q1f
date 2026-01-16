import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { OperationRow } from "@/components/operations/operation-row";
import { OperationFilters } from "@/components/operations/operation-filters";
import { OperationDetailsSheet } from "@/components/operations/operation-details-sheet";
import { OperationRowSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { Search, Activity, Download } from "lucide-react";
import { type Operation } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function groupOperationsByDay(operations: Operation[]): Map<string, Operation[]> {
  const groups = new Map<string, Operation[]>();
  
  for (const op of operations) {
    const dateKey = op.createdAt 
      ? getLocalDateKey(new Date(op.createdAt))
      : "unknown";
    
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(op);
  }
  
  return groups;
}

export default function ActivityPage() {
  useSetPageTitle("Activity");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { toast } = useToast();

  const { data: operations, isLoading } = useQuery<{ operations: Operation[]; nextCursor?: string }>({
    queryKey: ["/api/operations", { filter: filter !== "all" ? filter : undefined, q: search || undefined }],
  });

  const filteredOperations = operations?.operations || [];

  const groupedOperations = useMemo(() => {
    return groupOperationsByDay(filteredOperations);
  }, [filteredOperations]);

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);
      if (search) params.set("q", search);
      
      const queryString = params.toString();
      const exportUrl = `/api/activity/export${queryString ? `?${queryString}` : ""}`;
      
      const response = await fetch(exportUrl, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `zeon-activity-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
      
      toast({ title: "Statement exported successfully" });
    } catch (error) {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

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

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto pb-24">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <PageHeader title="Activity" subtitle="View your transaction history" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          disabled={isExporting || filteredOperations.length === 0}
          data-testid="button-export-csv"
        >
          <Download className="w-4 h-4 mr-1" />
          Export
        </Button>
      </div>

      <div className="space-y-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        <OperationFilters value={filter} onChange={setFilter} />
      </div>

      {isLoading ? (
        <Card className="divide-y divide-border">
          <OperationRowSkeleton />
          <OperationRowSkeleton />
          <OperationRowSkeleton />
          <OperationRowSkeleton />
          <OperationRowSkeleton />
        </Card>
      ) : filteredOperations.length > 0 ? (
        <div className="space-y-4">
          {Array.from(groupedOperations.entries()).map(([dateKey, ops]) => (
            <div key={dateKey}>
              <h3 
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 px-1"
                data-testid={`date-header-${dateKey}`}
              >
                {formatDateHeader(dateKey)}
              </h3>
              <Card className="divide-y divide-border overflow-hidden">
                {ops.map((operation) => (
                  <OperationRow 
                    key={operation.id} 
                    operation={operation} 
                    onClick={() => handleOperationClick(operation)}
                  />
                ))}
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Activity}
            title="No transactions"
            description={search || filter !== "all" ? "No matching transactions found" : "Your transaction history will appear here"}
          />
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
