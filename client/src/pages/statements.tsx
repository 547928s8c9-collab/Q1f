import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Calendar, TrendingUp, TrendingDown, RefreshCw, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface StatementSummary {
  year: number;
  month: number;
  period: string;
  operationCount: number;
  completedCount: number;
  totalIn: string;
  totalOut: string;
  totalFees: string;
  net: string;
}

function toMajorUnits(minorUnits: string, decimals: number = 6): number {
  const value = BigInt(minorUnits || "0");
  const divisor = BigInt(Math.pow(10, decimals));
  const majorPart = value / divisor;
  const remainder = value % divisor;
  return Number(majorPart) + Number(remainder) / Math.pow(10, decimals);
}

function formatMoney(minorUnits: string): string {
  const major = toMajorUnits(minorUnits);
  return major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SummarySkeleton() {
  return (
    <Card className="p-5">
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function getAvailableMonths(): { year: number; month: number; label: string }[] {
  const months: { year: number; month: number; label: string }[] = [];
  const now = new Date();
  
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    });
  }
  
  return months;
}

export default function StatementsPage() {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  
  const availableMonths = getAvailableMonths();
  const [selectedMonth, setSelectedMonth] = useState(
    `${availableMonths[0].year}-${availableMonths[0].month}`
  );

  const [year, month] = selectedMonth.split("-").map(Number);

  const { data: summary, isLoading, error, refetch } = useQuery<StatementSummary>({
    queryKey: ["/api/statements/summary", { year, month }],
    queryFn: async () => {
      const res = await fetch(`/api/statements/summary?year=${year}&month=${month}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch statement summary");
      return res.json();
    },
  });

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/statements/monthly?year=${year}&month=${month}`, {
        credentials: "include",
      });
      
      if (!res.ok) {
        throw new Error("Failed to generate statement");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zeon-statement-${year}-${String(month).padStart(2, "0")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Statement downloaded",
        description: `Your ${summary?.period || "monthly"} statement is ready.`,
      });
    } catch (err) {
      toast({
        title: "Download failed",
        description: "Could not generate your statement. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const netValue = summary ? BigInt(summary.net) : BigInt(0);
  const isPositive = netValue >= BigInt(0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Statements"
        subtitle="Download monthly account statements"
      />

      <div className="flex-1 overflow-auto px-4 pb-24 space-y-6">
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium">Select Period</h3>
              <p className="text-xs text-muted-foreground">Choose a month to view or download</p>
            </div>
          </div>
          
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger data-testid="select-month">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((m) => (
                <SelectItem
                  key={`${m.year}-${m.month}`}
                  value={`${m.year}-${m.month}`}
                  data-testid={`option-${m.year}-${m.month}`}
                >
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        {isLoading ? (
          <SummarySkeleton />
        ) : error ? (
          <EmptyState
            icon={AlertCircle}
            title="Failed to load"
            description="Could not load statement summary"
            action={{
              label: "Try again",
              onClick: () => refetch(),
            }}
          />
        ) : summary && summary.operationCount === 0 ? (
          <EmptyState
            icon={FileText}
            title="No activity"
            description={`No transactions found for ${summary.period}`}
          />
        ) : summary ? (
          <>
            <Card className="p-5" data-testid="summary-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{summary.period}</h3>
                <span className="text-xs text-muted-foreground">
                  {summary.completedCount} of {summary.operationCount} transactions
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total In</p>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-positive" />
                    <span className="font-semibold text-positive tabular-nums" data-testid="text-total-in">
                      +{formatMoney(summary.totalIn)}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Out</p>
                  <div className="flex items-center gap-1">
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold tabular-nums" data-testid="text-total-out">
                      -{formatMoney(summary.totalOut)}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Fees</p>
                  <span className="font-semibold tabular-nums text-muted-foreground" data-testid="text-fees">
                    {formatMoney(summary.totalFees)}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Net Change</p>
                  <span
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      isPositive ? "text-positive" : "text-destructive"
                    )}
                    data-testid="text-net"
                  >
                    {isPositive ? "+" : ""}{formatMoney(summary.net)} USDT
                  </span>
                </div>
              </div>
            </Card>

            <Button
              size="lg"
              className="w-full"
              onClick={handleDownload}
              disabled={isDownloading}
              data-testid="button-download-pdf"
            >
              {isDownloading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF Statement
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Statement includes all completed transactions for the selected period
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
