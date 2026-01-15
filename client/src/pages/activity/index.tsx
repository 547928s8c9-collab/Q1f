import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { OperationRow } from "@/components/operations/operation-row";
import { OperationFilters } from "@/components/operations/operation-filters";
import { OperationRowSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Search, Activity } from "lucide-react";
import { type Operation } from "@shared/schema";

export default function ActivityPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: operations, isLoading } = useQuery<{ operations: Operation[]; nextCursor?: string }>({
    queryKey: ["/api/operations", { filter: filter !== "all" ? filter : undefined, q: search || undefined }],
  });

  const filteredOperations = operations?.operations || [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Activity" subtitle="View your transaction history" />

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
