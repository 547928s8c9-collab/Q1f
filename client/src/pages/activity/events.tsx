import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Clock } from "lucide-react";

interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: Date;
  status: "completed" | "pending" | "failed";
}

const mockEvents: ActivityEvent[] = [
  {
    id: "1",
    type: "deposit",
    title: "Deposit Completed",
    description: "USDT deposit of $1,000 has been credited to your account.",
    timestamp: new Date(Date.now() - 3600000),
    status: "completed",
  },
  {
    id: "2",
    type: "strategy",
    title: "Strategy Activated",
    description: "BTC Growth strategy is now active with your funds.",
    timestamp: new Date(Date.now() - 7200000),
    status: "completed",
  },
  {
    id: "3",
    type: "payout",
    title: "Profit Payout",
    description: "Weekly profit payout of $45.32 has been processed.",
    timestamp: new Date(Date.now() - 86400000),
    status: "completed",
  },
];

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "pending":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatTimeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ActivityEvents() {
  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6" data-testid="activity-events-page">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Activity Events</h1>
          <p className="text-muted-foreground">
            Recent events and notifications for your account.
          </p>
        </div>
        <Bell className="h-6 w-6 text-muted-foreground" />
      </div>

      <div className="space-y-4">
        {mockEvents.map((event) => (
          <Card key={event.id} data-testid={`activity-event-${event.id}`}>
            <CardContent className="flex items-start justify-between gap-4 p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{event.title}</h3>
                  <Badge className={getStatusColor(event.status)}>
                    {event.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{event.description}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatTimeAgo(event.timestamp)}
              </div>
            </CardContent>
          </Card>
        ))}

        {mockEvents.length === 0 && (
          <Card data-testid="no-events-card">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <Bell className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground">No recent activity events</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
