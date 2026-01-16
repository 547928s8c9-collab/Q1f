import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, Check, ChevronRight, Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import type { InboxCard, NotificationTypeValue } from "@shared/schema";

interface NotificationsResponse {
  notifications: InboxCard[];
  unreadCount: number;
}

function getTypeVariant(type: NotificationTypeValue): "default" | "success" | "warning" | "danger" | "primary" {
  switch (type) {
    case "transaction":
      return "primary";
    case "kyc":
      return "warning";
    case "security":
      return "danger";
    case "system":
    default:
      return "default";
  }
}

function getTypeLabel(type: NotificationTypeValue): string {
  switch (type) {
    case "transaction":
      return "Transaction";
    case "kyc":
      return "Verification";
    case "security":
      return "Security";
    case "system":
      return "System";
    default:
      return type;
  }
}

function InboxCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-2 w-2 rounded-full mt-2" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <div className="flex items-center justify-between pt-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function InboxPage() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data, isLoading, error, refetch } = useQuery<NotificationsResponse>({
    queryKey: ["/api/notifications", { unreadOnly: filter === "unread" }],
    queryFn: async () => {
      const params = filter === "unread" ? "?unreadOnly=true" : "";
      const res = await fetch(`/api/notifications${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/notifications/${id}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/notifications/read-all", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const handleCardClick = (card: InboxCard) => {
    if (!card.isRead) {
      markReadMutation.mutate(card.id);
    }
    if (card.ctaPath) {
      navigate(card.ctaPath);
    }
  };

  const unreadCount = data?.unreadCount || 0;
  const notifications = data?.notifications || [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Inbox"
        action={
          unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <Check className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )
        }
      />

      <div className="px-4 pb-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "unread")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="unread" data-testid="tab-unread">
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-24">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <InboxCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={Bell}
            title="Failed to load"
            description="Could not load your notifications"
            action={{
              label: "Try again",
              onClick: () => refetch(),
            }}
          />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={filter === "unread" ? "All caught up" : "No notifications"}
            description={filter === "unread" ? "You have no unread messages" : "Your inbox is empty"}
          />
        ) : (
          <div className="space-y-3">
            {notifications.map((card) => (
              <Card
                key={card.id}
                className={cn(
                  "p-4 hover-elevate cursor-pointer transition-colors",
                  !card.isRead && "border-l-2 border-l-primary"
                )}
                onClick={() => handleCardClick(card)}
                data-testid={`inbox-card-${card.id}`}
              >
                <div className="flex items-start gap-3">
                  {!card.isRead && (
                    <span className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  )}
                  <div className={cn("flex-1 min-w-0", card.isRead && "ml-5")}>
                    <div className="flex items-center gap-2 mb-1">
                      <Chip size="sm" variant={getTypeVariant(card.type)}>
                        {getTypeLabel(card.type)}
                      </Chip>
                    </div>
                    <p className="font-medium text-sm truncate">{card.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {card.message}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(card.createdAt), { addSuffix: true })}
                      </p>
                      {card.ctaLabel && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardClick(card);
                          }}
                          data-testid={`cta-${card.id}`}
                        >
                          {card.ctaLabel}
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
