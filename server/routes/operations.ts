import { storage } from "../storage";
import type { RouteDeps } from "./types";

export function registerOperationsRoutes({ app, isAuthenticated, getUserId }: RouteDeps): void {
  // GET /api/operations (protected)
  app.get("/api/operations", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { filter, q, cursor, limit } = req.query;
      const result = await storage.getOperations(
        userId,
        filter as string,
        q as string,
        cursor as string,
        limit ? parseInt(limit as string) : 50
      );
      res.json(result);
    } catch (error) {
      console.error("Get operations error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/operations/export - Export operations as CSV (protected)
  // IMPORTANT: Must come BEFORE /api/operations/:id to prevent "export" matching as :id
  app.get("/api/operations/export", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { filter, q } = req.query;
      
      // Use same filters as UI
      const result = await storage.getOperations(
        userId,
        filter as string,
        q as string,
        undefined,
        1000
      );
      const operations = result.operations;

      // Build CSV
      const headers = ["Date", "Type", "Status", "Asset", "Amount", "Fee", "Strategy", "Reference"];
      const rows = operations.map((op) => [
        op.createdAt?.toISOString() || "",
        op.type || "",
        op.status || "",
        op.asset || "",
        op.amount || "",
        op.fee || "",
        op.strategyName || "",
        op.providerRef || op.txHash || "",
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="zeon-activity-${new Date().toISOString().split("T")[0]}.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Export operations error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/operations/:id (protected)
  app.get("/api/operations/:id", isAuthenticated, async (req, res) => {
    try {
      const operation = await storage.getOperation(req.params.id);
      if (!operation) {
        return res.status(404).json({ error: "Operation not found" });
      }
      res.json(operation);
    } catch (error) {
      console.error("Get operation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
