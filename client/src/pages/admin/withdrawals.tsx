import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSetPageTitle } from "@/hooks/use-page-title";
import {
  Loader2,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Wallet,
  Play,
  Check,
  X,
  RefreshCw,
  Copy,
} from "lucide-react";
import { Link } from "wouter";
import type { AdminWithdrawalListItem, AdminWithdrawalDetail } from "@shared/admin/dto";

interface AdminMeResponse {
  ok: boolean;
  data: {
    adminUserId: string;
    userId: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning",
  APPROVED: "bg-positive/10 text-positive",
  PROCESSING: "bg-primary/10 text-primary",
  COMPLETED: "bg-positive/10 text-positive",
  FAILED: "bg-destructive/10 text-destructive",
  REJECTED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
};

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  PENDING: Clock,
  APPROVED: CheckCircle,
  PROCESSING: RefreshCw,
  COMPLETED: Check,
  FAILED: XCircle,
  REJECTED: XCircle,
  CANCELLED: X,
};

type ActionType = "REQUEST_APPROVAL" | "APPROVE" | "REJECT" | "MARK_PROCESSING" | "MARK_COMPLETED" | "MARK_FAILED";

function formatAmount(amountMinor: string, currency: string): string {
  const decimals = currency === "USDT" ? 6 : 2;
  const amount = Number(amountMinor) / Math.pow(10, decimals);
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals })} ${currency}`;
}

export default function AdminWithdrawals() {
  useSetPageTitle("Withdrawals");
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWithdrawalId, setSelectedWithdrawalId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<{ open: boolean; action: ActionType | null }>({ open: false, action: null });
  const [actionReason, setActionReason] = useState("");
  const [txHash, setTxHash] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const { data: adminMeData } = useQuery<AdminMeResponse>({
    queryKey: ["/api/admin/me"],
  });

  const permissions = useMemo(() => {
    const perms = new Set(adminMeData?.data?.permissions || []);
    return {
      canApprove: perms.has("withdrawals.approve"),
      canManage: perms.has("withdrawals.manage"),
    };
  }, [adminMeData]);

  const { data: withdrawalsData, isLoading, error, refetch } = useQuery<{ ok: boolean; data: AdminWithdrawalListItem[]; meta?: { nextCursor: string | null } }>({
    queryKey: ["/api/admin/withdrawals", { status: statusFilter === "all" ? undefined : statusFilter }],
  });

  const { data: detailData, isLoading: detailLoading } = useQuery<{ ok: boolean; data: AdminWithdrawalDetail }>({
    queryKey: ["/api/admin/withdrawals", selectedWithdrawalId],
    enabled: !!selectedWithdrawalId,
  });

  const requestApprovalMutation = useMutation({
    mutationFn: async ({ withdrawalId }: { withdrawalId: string }) => {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/admin/withdrawals/${withdrawalId}/request-approval`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Approval requested", description: "Waiting for another admin to approve" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      setActionDialog({ open: false, action: null });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to request approval", 
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ pendingActionId }: { pendingActionId: string }) => {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/admin/pending-actions/${pendingActionId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Withdrawal approved", description: "Withdrawal is now approved for processing" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      setActionDialog({ open: false, action: null });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to approve withdrawal", 
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ withdrawalId, reason }: { withdrawalId: string; reason: string }) => {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/admin/withdrawals/${withdrawalId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ action: "REJECT", reason }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Withdrawal rejected", description: "Withdrawal has been rejected" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      setActionDialog({ open: false, action: null });
      setActionReason("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to reject withdrawal", 
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ withdrawalId, action, reason, txHash, error }: { 
      withdrawalId: string; 
      action: "MARK_PROCESSING" | "MARK_COMPLETED" | "MARK_FAILED";
      reason: string;
      txHash?: string;
      error?: string;
    }) => {
      const idempotencyKey = crypto.randomUUID();
      const body: any = { action, reason };
      if (txHash) body.txHash = txHash;
      if (error) body.error = error;
      
      const res = await fetch(`/api/admin/withdrawals/${withdrawalId}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const messages: Record<string, string> = {
        PROCESSING: "Withdrawal is now being processed",
        COMPLETED: "Withdrawal completed successfully",
        FAILED: "Withdrawal marked as failed",
      };
      toast({ title: "Status updated", description: messages[data.data?.status] || "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      setActionDialog({ open: false, action: null });
      setActionReason("");
      setTxHash("");
      setErrorMessage("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update status", 
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const withdrawals = withdrawalsData?.data || [];
  const detail = detailData?.data;

  const filteredWithdrawals = withdrawals.filter((w) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return w.email?.toLowerCase().includes(q) || w.userId.toLowerCase().includes(q) || w.id.toLowerCase().includes(q);
    }
    return true;
  });

  const handleActionClick = (action: ActionType) => {
    setActionDialog({ open: true, action });
  };

  const handleConfirmAction = () => {
    if (!selectedWithdrawalId) return;
    
    switch (actionDialog.action) {
      case "REQUEST_APPROVAL":
        requestApprovalMutation.mutate({ withdrawalId: selectedWithdrawalId });
        break;
      case "APPROVE":
        if (detail?.pendingAction) {
          approveMutation.mutate({ pendingActionId: detail.pendingAction.id });
        }
        break;
      case "REJECT":
        if (!actionReason.trim()) return;
        rejectMutation.mutate({ withdrawalId: selectedWithdrawalId, reason: actionReason.trim() });
        break;
      case "MARK_PROCESSING":
        if (!actionReason.trim()) return;
        processMutation.mutate({ 
          withdrawalId: selectedWithdrawalId, 
          action: "MARK_PROCESSING",
          reason: actionReason.trim()
        });
        break;
      case "MARK_COMPLETED":
        if (!actionReason.trim()) return;
        processMutation.mutate({ 
          withdrawalId: selectedWithdrawalId, 
          action: "MARK_COMPLETED",
          reason: actionReason.trim(),
          txHash: txHash.trim() || undefined
        });
        break;
      case "MARK_FAILED":
        if (!actionReason.trim()) return;
        processMutation.mutate({ 
          withdrawalId: selectedWithdrawalId, 
          action: "MARK_FAILED",
          reason: actionReason.trim(),
          error: errorMessage.trim() || undefined
        });
        break;
    }
  };

  const isPending = requestApprovalMutation.isPending || approveMutation.isPending || 
                    rejectMutation.isPending || processMutation.isPending;

  const needsReason = actionDialog.action && ["REJECT", "MARK_PROCESSING", "MARK_COMPLETED", "MARK_FAILED"].includes(actionDialog.action);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Address copied to clipboard" });
  };

  const listSkeleton = (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <Card key={`withdrawal-skeleton-${index}`} className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-home">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Withdrawals Queue</h1>
            </div>
          </div>
          <Badge variant="outline">Admin Console</Badge>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email, user ID, or withdrawal ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="PROCESSING">Processing</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="py-6">
            {listSkeleton}
          </div>
        ) : error ? (
          <Card className="p-8">
            <EmptyState
              icon={AlertTriangle}
              title="Unable to load withdrawals"
              description="There was an error loading withdrawals. Please try again."
              action={{ label: "Retry", onClick: () => void refetch() }}
            />
          </Card>
        ) : filteredWithdrawals.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No withdrawals found</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredWithdrawals.map((withdrawal) => {
              const StatusIcon = STATUS_ICONS[withdrawal.status] || Clock;
              return (
                <Card
                  key={withdrawal.id}
                  className="p-4 hover-elevate cursor-pointer"
                  onClick={() => setSelectedWithdrawalId(withdrawal.id)}
                  data-testid={`card-withdrawal-${withdrawal.id}`}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${STATUS_COLORS[withdrawal.status] || "bg-muted"}`}>
                        <StatusIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium" data-testid="text-withdrawal-amount">
                          {formatAmount(withdrawal.amountMinor, withdrawal.currency)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {withdrawal.email || withdrawal.userId}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="text-right">
                        <p className="text-sm font-mono text-muted-foreground">{withdrawal.addressShort}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(withdrawal.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge className={STATUS_COLORS[withdrawal.status]} data-testid="badge-status">
                        {withdrawal.status}
                      </Badge>
                      {withdrawal.riskScore !== null && withdrawal.riskScore > 50 && (
                        <Badge variant="outline" className="text-warning border-warning">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Risk: {withdrawal.riskScore}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Sheet open={!!selectedWithdrawalId} onOpenChange={(open) => !open && setSelectedWithdrawalId(null)}>
        <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Withdrawal Details</SheetTitle>
          </SheetHeader>
          
          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <div className="mt-6 space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Amount</h3>
                <Card className="p-4">
                  <div className="text-2xl font-bold" data-testid="text-detail-amount">
                    {formatAmount(detail.amountMinor, detail.currency)}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Fee: {formatAmount(detail.feeMinor, detail.currency)}
                  </div>
                </Card>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Destination</h3>
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs break-all" data-testid="text-detail-address">{detail.address}</code>
                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(detail.address)} data-testid="button-copy-address">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">User</h3>
                <Card className="p-4 space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium" data-testid="text-detail-email">{detail.email || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">
                      {detail.user?.firstName} {detail.user?.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">User ID</span>
                    <span className="font-mono text-xs">{detail.userId}</span>
                  </div>
                </Card>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Status</h3>
                <Card className="p-4 space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className={STATUS_COLORS[detail.status]} data-testid="text-detail-status">
                      {detail.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium">
                      {new Date(detail.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {detail.approvedAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Approved</span>
                      <span className="font-medium">
                        {new Date(detail.approvedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {detail.processedAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Processed</span>
                      <span className="font-medium">
                        {new Date(detail.processedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {detail.completedAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Completed</span>
                      <span className="font-medium">
                        {new Date(detail.completedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {detail.txHash && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground">TX Hash</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs">{detail.txHash.slice(0, 10)}...</span>
                        <Button variant="ghost" size="icon" onClick={() => copyToClipboard(detail.txHash!)} data-testid="button-copy-txhash">
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>

              {detail.pendingAction && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pending Approval</h3>
                  <Card className="p-4 border-warning/50 bg-warning/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-warning" />
                      <span className="font-medium text-warning">Awaiting 4-eyes approval</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Requested by another admin. A different admin must approve this withdrawal.
                    </p>
                  </Card>
                </div>
              )}

              {(detail.rejectionReason || detail.lastError) && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Notes</h3>
                  <Card className="p-4">
                    {detail.rejectionReason && (
                      <div className="text-destructive">
                        <span className="font-medium">Rejection reason: </span>
                        {detail.rejectionReason}
                      </div>
                    )}
                    {detail.lastError && (
                      <div className="text-destructive mt-2">
                        <span className="font-medium">Error: </span>
                        {detail.lastError}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {detail.riskFlags && detail.riskFlags.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Risk Flags</h3>
                  <Card className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {detail.riskFlags.map((flag, i) => (
                        <Badge key={i} variant="outline" className="text-warning border-warning">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {(permissions.canApprove || permissions.canManage) && detail.allowedTransitions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    {permissions.canApprove && detail.status === "PENDING" && !detail.pendingAction && (
                      <Button 
                        onClick={() => handleActionClick("REQUEST_APPROVAL")} 
                        data-testid="button-request-approval"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Request Approval
                      </Button>
                    )}
                    {permissions.canApprove && detail.pendingAction && detail.status === "PENDING" && (
                      <Button 
                        onClick={() => handleActionClick("APPROVE")} 
                        data-testid="button-approve"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve (4-eyes)
                      </Button>
                    )}
                    {permissions.canApprove && detail.allowedTransitions.includes("REJECTED") && (
                      <Button 
                        variant="destructive"
                        onClick={() => handleActionClick("REJECT")}
                        data-testid="button-reject"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    )}
                    {permissions.canManage && detail.allowedTransitions.includes("PROCESSING") && (
                      <Button 
                        onClick={() => handleActionClick("MARK_PROCESSING")}
                        data-testid="button-mark-processing"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Mark Processing
                      </Button>
                    )}
                    {permissions.canManage && detail.allowedTransitions.includes("COMPLETED") && (
                      <Button 
                        onClick={() => handleActionClick("MARK_COMPLETED")}
                        data-testid="button-mark-completed"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Mark Completed
                      </Button>
                    )}
                    {permissions.canManage && detail.allowedTransitions.includes("FAILED") && (
                      <Button 
                        variant="destructive"
                        onClick={() => handleActionClick("MARK_FAILED")}
                        data-testid="button-mark-failed"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Mark Failed
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={actionDialog.open} onOpenChange={(open) => !open && setActionDialog({ open: false, action: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === "REQUEST_APPROVAL" && "Request Approval"}
              {actionDialog.action === "APPROVE" && "Approve Withdrawal"}
              {actionDialog.action === "REJECT" && "Reject Withdrawal"}
              {actionDialog.action === "MARK_PROCESSING" && "Mark as Processing"}
              {actionDialog.action === "MARK_COMPLETED" && "Mark as Completed"}
              {actionDialog.action === "MARK_FAILED" && "Mark as Failed"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.action === "REQUEST_APPROVAL" && "This will create a pending approval request that must be approved by another admin (4-eyes principle)."}
              {actionDialog.action === "APPROVE" && "You are approving this withdrawal as the second reviewer. The withdrawal will be ready for processing."}
              {actionDialog.action === "REJECT" && "This will reject the withdrawal request. Please provide a reason."}
              {actionDialog.action === "MARK_PROCESSING" && "Mark this withdrawal as being processed. This indicates the transaction is being sent to the blockchain."}
              {actionDialog.action === "MARK_COMPLETED" && "Mark this withdrawal as completed. You may provide the transaction hash."}
              {actionDialog.action === "MARK_FAILED" && "Mark this withdrawal as failed. Please provide the error details."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {needsReason && (
              <Textarea
                placeholder="Enter reason for this action..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                rows={3}
                data-testid="textarea-reason"
              />
            )}
            {actionDialog.action === "MARK_COMPLETED" && (
              <Input
                placeholder="Transaction hash (optional)"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                data-testid="input-txhash"
              />
            )}
            {actionDialog.action === "MARK_FAILED" && (
              <Input
                placeholder="Error message (optional)"
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                data-testid="input-error"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ open: false, action: null })}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={isPending || (!!needsReason && !actionReason.trim())}
              data-testid="button-confirm-action"
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
