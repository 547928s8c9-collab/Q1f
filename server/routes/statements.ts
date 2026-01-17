import { storage } from "../storage";
import type { RouteDeps } from "./types";

export function registerStatementsRoutes({ app, isAuthenticated, getUserId }: RouteDeps): void {
  // GET /api/statements/summary - Get monthly statement summary (protected)
  app.get("/api/statements/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { year, month } = req.query;

      if (!year || !month) {
        return res.status(400).json({ error: "year and month are required" });
      }

      const yearNum = parseInt(year as string, 10);
      const monthNum = parseInt(month as string, 10);

      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ error: "Invalid year or month" });
      }

      // Get operations for the specified month using DB-level date filtering
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

      const operations = await storage.getOperationsByDate(userId, startDate, endDate);

      // Calculate summary
      let totalIn = BigInt(0);
      let totalOut = BigInt(0);
      let totalFees = BigInt(0);
      const inTypes = ["DEPOSIT_USDT", "DEPOSIT_CARD", "DAILY_PAYOUT", "PROFIT_PAYOUT"];
      const outTypes = ["WITHDRAW_USDT", "INVEST", "SUBSCRIPTION"];

      for (const op of operations) {
        if (op.status !== "completed") continue;
        const amount = BigInt(op.amount || "0");
        const fee = BigInt(op.fee || "0");

        if (inTypes.includes(op.type)) {
          totalIn += amount;
        } else if (outTypes.includes(op.type)) {
          totalOut += amount;
        }
        totalFees += fee;
      }

      const net = totalIn - totalOut - totalFees;

      res.json({
        year: yearNum,
        month: monthNum,
        period: `${startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
        operationCount: operations.length,
        completedCount: operations.filter((op) => op.status === "completed").length,
        totalIn: totalIn.toString(),
        totalOut: totalOut.toString(),
        totalFees: totalFees.toString(),
        net: net.toString(),
      });
    } catch (error) {
      console.error("Statement summary error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/statements/monthly - Generate monthly PDF statement (protected)
  app.get("/api/statements/monthly", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { year, month } = req.query;

      if (!year || !month) {
        return res.status(400).json({ error: "year and month are required" });
      }

      const yearNum = parseInt(year as string, 10);
      const monthNum = parseInt(month as string, 10);

      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ error: "Invalid year or month" });
      }

      // Get operations for the specified month using DB-level date filtering
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

      const operations = await storage.getOperationsByDate(userId, startDate, endDate);

      // Calculate summary
      let totalIn = BigInt(0);
      let totalOut = BigInt(0);
      let totalFees = BigInt(0);
      const inTypes = ["DEPOSIT_USDT", "DEPOSIT_CARD", "DAILY_PAYOUT", "PROFIT_PAYOUT"];
      const outTypes = ["WITHDRAW_USDT", "INVEST", "SUBSCRIPTION"];

      for (const op of operations) {
        if (op.status !== "completed") continue;
        const amount = BigInt(op.amount || "0");
        const fee = BigInt(op.fee || "0");

        if (inTypes.includes(op.type)) {
          totalIn += amount;
        } else if (outTypes.includes(op.type)) {
          totalOut += amount;
        }
        totalFees += fee;
      }

      const net = totalIn - totalOut - totalFees;

      // Generate PDF
      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "A4", margin: 50 });

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="zeon-statement-${yearNum}-${String(monthNum).padStart(2, "0")}.pdf"`
      );

      // Pipe to response
      doc.pipe(res);

      // Helper function to format amounts
      const formatAmount = (minorUnits: string, decimals: number = 6): string => {
        const value = BigInt(minorUnits || "0");
        const divisor = BigInt(Math.pow(10, decimals));
        const majorPart = value / divisor;
        const remainder = value % divisor;
        const formatted = Number(majorPart) + Number(remainder) / Math.pow(10, decimals);
        return formatted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      // Header
      doc.fontSize(24).font("Helvetica-Bold").text("ZEON", 50, 50);
      doc.fontSize(10).font("Helvetica").fillColor("#666666").text("Monthly Statement", 50, 78);
      
      // Period
      const periodText = `${startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
      doc.fontSize(16).font("Helvetica-Bold").fillColor("#000000").text(periodText, 50, 110);

      // Statement info
      doc.fontSize(9).font("Helvetica").fillColor("#666666");
      doc.text(`Account: ${userId.substring(0, 8)}...${userId.slice(-4)}`, 50, 140);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}`, 50, 152);

      // Summary box
      const boxY = 180;
      doc.rect(50, boxY, 495, 80).fillAndStroke("#f8f9fa", "#e9ecef");

      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000");
      doc.text("Summary", 65, boxY + 12);

      doc.fontSize(9).font("Helvetica").fillColor("#666666");
      const col1 = 65;
      const col2 = 220;
      const col3 = 375;
      
      doc.text("Total In", col1, boxY + 35);
      doc.text("Total Out", col2, boxY + 35);
      doc.text("Net", col3, boxY + 35);

      doc.fontSize(14).font("Helvetica-Bold").fillColor("#22c55e");
      doc.text(`+${formatAmount(totalIn.toString())} USDT`, col1, boxY + 50);
      
      doc.fillColor("#ef4444");
      doc.text(`-${formatAmount(totalOut.toString())} USDT`, col2, boxY + 50);
      
      doc.fillColor(net >= 0 ? "#22c55e" : "#ef4444");
      doc.text(`${net >= 0 ? "+" : ""}${formatAmount(net.toString())} USDT`, col3, boxY + 50);

      // Operations table
      const tableY = boxY + 100;
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000");
      doc.text("Operations", 50, tableY);
      doc.fontSize(9).fillColor("#666666").font("Helvetica");
      doc.text(`${operations.length} transactions`, 130, tableY + 2);

      // Table header
      const headerY = tableY + 25;
      doc.rect(50, headerY, 495, 20).fill("#f1f5f9");
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#475569");
      doc.text("Date", 55, headerY + 6);
      doc.text("Type", 130, headerY + 6);
      doc.text("Description", 220, headerY + 6);
      doc.text("Amount", 400, headerY + 6);
      doc.text("Status", 480, headerY + 6);

      // Table rows
      let rowY = headerY + 25;
      const maxRowsPerPage = 25;
      let rowCount = 0;

      for (const op of operations) {
        if (rowCount >= maxRowsPerPage && rowCount % maxRowsPerPage === 0) {
          doc.addPage();
          rowY = 50;
        }

        const rowBg = rowCount % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(50, rowY - 3, 495, 18).fill(rowBg);

        doc.fontSize(8).font("Helvetica").fillColor("#374151");
        
        // Date
        const opDate = op.createdAt ? new Date(op.createdAt) : new Date();
        doc.text(opDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }), 55, rowY);
        
        // Type
        const typeLabels: Record<string, string> = {
          DEPOSIT_USDT: "Deposit",
          DEPOSIT_CARD: "Card Deposit",
          WITHDRAW_USDT: "Withdrawal",
          INVEST: "Investment",
          DAILY_PAYOUT: "Daily Payout",
          PROFIT_PAYOUT: "Profit Payout",
          VAULT_TRANSFER: "Vault Transfer",
          SUBSCRIPTION: "Subscription",
          FX: "Exchange",
        };
        doc.text(typeLabels[op.type] || op.type, 130, rowY);
        
        // Description
        const desc = op.strategyName || op.reason || op.asset || "-";
        doc.text(desc.substring(0, 30), 220, rowY);
        
        // Amount
        const isInflow = inTypes.includes(op.type);
        const amountColor = isInflow ? "#22c55e" : "#374151";
        doc.fillColor(amountColor);
        const amountText = `${isInflow ? "+" : "-"}${formatAmount(op.amount || "0")}`;
        doc.text(amountText, 400, rowY);
        
        // Status
        const statusColors: Record<string, string> = {
          completed: "#22c55e",
          pending: "#f59e0b",
          failed: "#ef4444",
          cancelled: "#6b7280",
        };
        doc.fillColor(statusColors[op.status] || "#374151");
        doc.text(op.status.charAt(0).toUpperCase() + op.status.slice(1), 480, rowY);

        rowY += 18;
        rowCount++;
      }

      if (operations.length === 0) {
        doc.fontSize(10).font("Helvetica").fillColor("#6b7280");
        doc.text("No operations for this period", 50, rowY + 10);
      }

      // Footer
      doc.fontSize(8).font("Helvetica").fillColor("#9ca3af");
      doc.text(
        "This statement is for informational purposes only. ZEON Fintech Dashboard.",
        50,
        doc.page.height - 50,
        { align: "center", width: 495 }
      );

      // Finalize
      doc.end();
    } catch (error) {
      console.error("PDF statement error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
