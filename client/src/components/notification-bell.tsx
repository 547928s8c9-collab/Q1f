import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import { getInboxConfig } from "@/lib/inbox-map";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import type { InboxCard } from "@shared/schema";

interface NotificationsResponse {
  notifications: InboxCard[];
  unreadCount: number;
}

export function NotificationBell() {
  const [, navigate] = useLocation();

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ["/api/notifications", { limit: 5 }],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=5", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    refetchInterval: 30000,
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
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="notifications-popover">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read-popover"
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p>No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((card) => {
                const config = getInboxConfig(card.type);
                const Icon = config.icon;
                
                return (
                  <div
                    key={card.id}
                    className={cn(
                      "px-4 py-3 hover-elevate cursor-pointer",
                      !card.isRead && "bg-primary/5"
                    )}
                    onClick={() => handleCardClick(card)}
                    data-testid={`notification-${card.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
                        config.bgColor
                      )}>
                        <Icon className={cn("h-4 w-4", config.iconColor)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Chip size="sm" variant={config.variant}>
                            {config.label}
                          </Chip>
                          {!card.isRead && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </div>
                        <p className={cn(
                          "text-sm truncate",
                          !card.isRead ? "font-medium" : "font-normal"
                        )}>
                          {card.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{card.message}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(card.createdAt), { addSuffix: true })}
                          </p>
                          {card.ctaLabel && (
                            <span className="text-xs text-primary flex items-center gap-0.5 font-medium">
                              {card.ctaLabel}
                              <ChevronRight className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <div className="border-t px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => navigate("/inbox")}
            data-testid="button-see-all"
          >
            See all notifications
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
