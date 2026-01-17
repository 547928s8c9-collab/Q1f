import { storage } from "../storage";
import type { RouteDeps } from "./types";
import { updateNotificationPreferencesSchema } from "@shared/schema";

export function registerNotificationsRoutes({ app, isAuthenticated, devOnly, getUserId }: RouteDeps): void {
  // GET /api/notifications (protected) - returns InboxCard format
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const unreadOnly = req.query.unreadOnly === "true";
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      const notificationsData = await storage.getNotifications(userId, unreadOnly, limit);
      const unreadCount = await storage.getUnreadNotificationCount(userId);
      
      const { getNotificationCta, normalizeNotificationType } = await import("@shared/schema");
      
      res.json({
        notifications: notificationsData.map((n) => {
          const normalizedType = normalizeNotificationType(n.type);
          const cta = getNotificationCta(n.type, n.resourceType, n.resourceId);
          return {
            id: n.id,
            type: normalizedType,
            title: n.title,
            message: n.message,
            isRead: n.isRead,
            createdAt: n.createdAt?.toISOString(),
            ctaLabel: cta.label,
            ctaPath: cta.path,
          };
        }),
        unreadCount,
      });
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/notifications/count (protected)
  app.get("/api/notifications/count", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const unreadCount = await storage.getUnreadNotificationCount(userId);
      res.json({ unreadCount });
    } catch (error) {
      console.error("Get notification count error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/notifications/:id/read (protected)
  app.post("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const notificationId = req.params.id;

      // IDOR protection: verify ownership before update
      const notification = await storage.getNotification(notificationId);
      if (!notification || notification.userId !== userId) {
        return res.status(404).json({ error: "Notification not found" });
      }

      await storage.markNotificationRead(notificationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark notification read error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/notifications/read-all (protected)
  app.post("/api/notifications/read-all", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark all notifications read error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/notifications/seed - Seed demo notifications (protected, dev only)
  app.post("/api/notifications/seed", isAuthenticated, devOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      const operations = await storage.getOperations(userId, undefined, undefined, undefined, 5);
      const operationId = operations.operations[0]?.id;
      
      const demoNotifications = [
        {
          userId,
          type: "transaction",
          title: "Deposit completed",
          message: "Your USDT deposit of 500.00 has been credited to your wallet",
          resourceType: "operation",
          resourceId: operationId || null,
          isRead: false,
        },
        {
          userId,
          type: "kyc",
          title: "Verification required",
          message: "Complete your identity verification to unlock all features",
          resourceType: "kyc",
          resourceId: null,
          isRead: false,
        },
        {
          userId,
          type: "security",
          title: "New login detected",
          message: "A new login was detected from Chrome on Windows. If this wasn't you, secure your account.",
          resourceType: "security",
          resourceId: null,
          isRead: false,
        },
        {
          userId,
          type: "system",
          title: "Scheduled maintenance",
          message: "Scheduled maintenance on Jan 20 from 2:00 AM to 4:00 AM UTC. Some features may be unavailable.",
          resourceType: null,
          resourceId: null,
          isRead: true,
        },
        {
          userId,
          type: "transaction",
          title: "Profit payout received",
          message: "Daily profit payout of 12.45 USDT has been added to your Profit Vault",
          resourceType: "operation",
          resourceId: null,
          isRead: false,
        },
      ];
      
      for (const n of demoNotifications) {
        await storage.createNotification(n);
      }
      
      res.json({ success: true, count: demoNotifications.length });
    } catch (error) {
      console.error("Seed notifications error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/notification-preferences (protected)
  app.get("/api/notification-preferences", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const preferences = await storage.getNotificationPreferences(userId);
      res.json(preferences);
    } catch (error) {
      console.error("Get notification preferences error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/notification-preferences (protected)
  app.put("/api/notification-preferences", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = updateNotificationPreferencesSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }

      const updated = await storage.updateNotificationPreferences(userId, parsed.data);
      res.json(updated);
    } catch (error) {
      console.error("Update notification preferences error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
