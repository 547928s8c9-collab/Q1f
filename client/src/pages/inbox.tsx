import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, Check, ChevronRight, Inbox, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getInboxConfig } from "@/lib/inbox-map";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import type { InboxCard } from "@shared/schema";

interface NotificationsResponse {
  notifications: InboxCard[];
  unreadCount: number;
}

function InboxCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <div className="flex items-center justify-between pt-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function NotificationCard({ 
  card, 
  onClick,
  isPending 
}: { 
  card: InboxCard; 
  onClick: () => void;
  isPending?: boolean;
}) {
  const config = getInboxConfig(card.type);
  const Icon = config.icon;

  return (
    <Card
      className={cn(
        "p-4 hover-elevate cursor-pointer transition-all",
        !card.isRead && "ring-1 ring-primary/20 bg-primary/[0.02]"
      )}
      onClick={onClick}
      data-testid={`inbox-card-${card.id}`}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0",
          config.bgColor
        )}>
          <Icon className={cn("h-5 w-5", config.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Chip size="sm" variant={config.variant}>
              {config.label}
            </Chip>
            {!card.isRead && (
              <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
            )}
          </div>
          <p className={cn(
            "text-sm truncate",
            !card.isRead ? "font-semibold" : "font-medium"
          )}>
            {card.title}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {card.message}
          </p>
          <div className="flex items-center justify-between mt-2.5">
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(card.createdAt), { addSuffix: true })}
            </p>
            {card.ctaLabel && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
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
  );
}

export default function InboxPage() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data, isLoading, error, refetch, isFetching } = useQuery<NotificationsResponse>({
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
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        action={
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
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
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
          </div>
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
            title={filter === "unread" ? "All caught up" : "No notifications yet"}
            description={filter === "unread" 
              ? "You have no unread messages" 
              : "When something important happens, you'll see it here"
            }
          />
        ) : (
          <div className="space-y-3">
            {notifications.map((card) => (
              <NotificationCard
                key={card.id}
                card={card}
                onClick={() => handleCardClick(card)}
                isPending={markReadMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
