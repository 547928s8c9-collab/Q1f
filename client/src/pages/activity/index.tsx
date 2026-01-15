import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { OperationRow } from "@/components/operations/operation-row";
import { OperationFilters } from "@/components/operations/operation-filters";
import { OperationRowSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Search, Activity, Download } from "lucide-react";
import { type Operation } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function ActivityPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const { data: operations, isLoading } = useQuery<{ operations: Operation[]; nextCursor?: string }>({
    queryKey: ["/api/operations", { filter: filter !== "all" ? filter : undefined, q: search || undefined }],
  });

  const filteredOperations = operations?.operations || [];

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      // Build query string with current filters
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);
      if (search) params.set("q", search);
      
      const queryString = params.toString();
      const exportUrl = `/api/operations/export${queryString ? `?${queryString}` : ""}`;
      
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

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
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

      <Card className="divide-y divide-border">
        {isLoading ? (
          <>
            <OperationRowSkeleton />
            <OperationRowSkeleton />
            <OperationRowSkeleton />
            <OperationRowSkeleton />
            <OperationRowSkeleton />
          </>
        ) : filteredOperations.length > 0 ? (
          filteredOperations.map((operation) => (
            <OperationRow key={operation.id} operation={operation} />
          ))
        ) : (
          <EmptyState
            icon={Activity}
            title="No transactions"
            description={search || filter !== "all" ? "No matching transactions found" : "Your transaction history will appear here"}
          />
        )}
      </Card>
    </div>
  );
}
