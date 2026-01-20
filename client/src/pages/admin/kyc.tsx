import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Search, CheckCircle, XCircle, AlertTriangle, Clock, ArrowLeft, Shield } from "lucide-react";
import { Link } from "wouter";
import type { AdminKycApplicantListItem, AdminKycApplicantDetail } from "@shared/admin/dto";
import { DemoModeBanner } from "@/components/admin/demo-mode-banner";

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-muted text-muted-foreground",
  IN_REVIEW: "bg-warning/10 text-warning",
  APPROVED: "bg-positive/10 text-positive",
  NEEDS_ACTION: "bg-accent/10 text-accent-foreground",
  REJECTED: "bg-destructive/10 text-destructive",
  ON_HOLD: "bg-muted text-muted-foreground",
};

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  NOT_STARTED: Clock,
  IN_REVIEW: Loader2,
  APPROVED: CheckCircle,
  NEEDS_ACTION: AlertTriangle,
  REJECTED: XCircle,
  ON_HOLD: Clock,
};

type DecisionType = "APPROVED" | "REJECTED" | "NEEDS_ACTION" | "ON_HOLD";

interface AdminMeResponse {
  ok: boolean;
  data: {
    adminUserId: string;
    userId: string;
    email: string;
    roles: string[];
    permissions: string[];
    isDemo?: boolean;
  };
}

export default function AdminKyc() {
  const { toast } = useToast();
  const { data: adminMeData } = useQuery<AdminMeResponse>({
    queryKey: ["/api/admin/me"],
  });
  const isDemo = adminMeData?.data?.isDemo ?? false;
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);
  const [decisionDialog, setDecisionDialog] = useState<{ open: boolean; decision: DecisionType | null }>({ open: false, decision: null });
  const [decisionReason, setDecisionReason] = useState("");

  const { data: applicantsData, isLoading } = useQuery<{ ok: boolean; data: AdminKycApplicantListItem[]; meta?: { nextCursor: string | null } }>({
    queryKey: ["/api/admin/kyc/applicants", { status: statusFilter === "all" ? undefined : statusFilter }],
  });

  const { data: detailData, isLoading: detailLoading } = useQuery<{ ok: boolean; data: AdminKycApplicantDetail }>({
    queryKey: ["/api/admin/kyc/applicants", selectedApplicantId],
    enabled: !!selectedApplicantId,
  });

  const decisionMutation = useMutation({
    mutationFn: async ({ applicantId, decision, reason }: { applicantId: string; decision: DecisionType; reason: string }) => {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/admin/kyc/applicants/${applicantId}/decision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ decision, reason }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Decision submitted", description: "KYC status updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kyc/applicants"] });
      setDecisionDialog({ open: false, decision: null });
      setDecisionReason("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to submit decision", 
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const applicants = applicantsData?.data || [];
  const detail = detailData?.data;

  const filteredApplicants = applicants.filter((a) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return a.email?.toLowerCase().includes(q) || a.userId.toLowerCase().includes(q);
    }
    return true;
  });

  const handleDecisionClick = (decision: DecisionType) => {
    setDecisionDialog({ open: true, decision });
  };

  const handleConfirmDecision = () => {
    if (!selectedApplicantId || !decisionDialog.decision || !decisionReason.trim()) return;
    decisionMutation.mutate({
      applicantId: selectedApplicantId,
      decision: decisionDialog.decision,
      reason: decisionReason.trim(),
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-home">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">KYC Queue</h1>
            </div>
          </div>
          <Badge variant="outline">Admin Console</Badge>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <DemoModeBanner isDemo={isDemo} />
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or user ID..."
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
              <SelectItem value="NOT_STARTED">Not Started</SelectItem>
              <SelectItem value="IN_REVIEW">In Review</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="NEEDS_ACTION">Needs Action</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="ON_HOLD">On Hold</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredApplicants.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No KYC applicants found</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredApplicants.map((applicant) => {
              const StatusIcon = STATUS_ICONS[applicant.status] || Clock;
              return (
                <Card
                  key={applicant.id}
                  className="p-4 hover-elevate cursor-pointer"
                  onClick={() => setSelectedApplicantId(applicant.id)}
                  data-testid={`card-applicant-${applicant.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${STATUS_COLORS[applicant.status] || "bg-muted"}`}>
                        <StatusIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium" data-testid="text-applicant-email">
                          {applicant.email || applicant.userId}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(applicant.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={STATUS_COLORS[applicant.status]} data-testid="badge-status">
                        {applicant.status.replace("_", " ")}
                      </Badge>
                      {applicant.riskLevel && (
                        <Badge variant="outline">{applicant.riskLevel} risk</Badge>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Sheet open={!!selectedApplicantId} onOpenChange={(open) => !open && setSelectedApplicantId(null)}>
        <SheetContent className="w-[450px] sm:max-w-[450px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>KYC Application Details</SheetTitle>
          </SheetHeader>
          
          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <div className="mt-6 space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">User Info</h3>
                <Card className="p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium" data-testid="text-detail-email">{detail.email || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">
                      {detail.user?.firstName} {detail.user?.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User ID</span>
                    <span className="font-mono text-xs">{detail.userId}</span>
                  </div>
                </Card>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">KYC Status</h3>
                <Card className="p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className={STATUS_COLORS[detail.status]} data-testid="text-detail-status">
                      {detail.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Level</span>
                    <span className="font-medium">{detail.level || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PEP Flag</span>
                    <span className="font-medium">{detail.pepFlag ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Submitted</span>
                    <span className="font-medium">
                      {detail.submittedAt ? new Date(detail.submittedAt).toLocaleString() : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reviewed</span>
                    <span className="font-medium">
                      {detail.reviewedAt ? new Date(detail.reviewedAt).toLocaleString() : "—"}
                    </span>
                  </div>
                </Card>
              </div>

              {(detail.rejectionReason || detail.needsActionReason) && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Decision Notes</h3>
                  <Card className="p-4">
                    {detail.rejectionReason && (
                      <p className="text-destructive">{detail.rejectionReason}</p>
                    )}
                    {detail.needsActionReason && (
                      <p className="text-warning">{detail.needsActionReason}</p>
                    )}
                  </Card>
                </div>
              )}

              {detail.allowedTransitions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.allowedTransitions.includes("APPROVED") && (
                      <Button 
                        onClick={() => handleDecisionClick("APPROVED")} 
                        className="bg-positive hover:bg-positive/90"
                        data-testid="button-approve"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                    )}
                    {detail.allowedTransitions.includes("NEEDS_ACTION") && (
                      <Button 
                        variant="outline"
                        onClick={() => handleDecisionClick("NEEDS_ACTION")}
                        data-testid="button-needs-action"
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Needs Action
                      </Button>
                    )}
                    {detail.allowedTransitions.includes("ON_HOLD") && (
                      <Button 
                        variant="outline"
                        onClick={() => handleDecisionClick("ON_HOLD")}
                        data-testid="button-on-hold"
                      >
                        <Clock className="h-4 w-4 mr-2" />
                        On Hold
                      </Button>
                    )}
                    {detail.allowedTransitions.includes("REJECTED") && (
                      <Button 
                        variant="destructive"
                        onClick={() => handleDecisionClick("REJECTED")}
                        data-testid="button-reject"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={decisionDialog.open} onOpenChange={(open) => !open && setDecisionDialog({ open: false, decision: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Confirm {decisionDialog.decision?.replace("_", " ")} Decision
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for this decision. This will be recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter reason for this decision..."
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              rows={4}
              data-testid="textarea-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog({ open: false, decision: null })}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDecision}
              disabled={!decisionReason.trim() || decisionMutation.isPending}
              data-testid="button-confirm-decision"
            >
              {decisionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
