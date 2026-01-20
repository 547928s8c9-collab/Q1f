import type { Express, Request, Response, NextFunction } from "express";
import type { RouteDeps } from "./types";

import { registerStrategiesRoutes } from "./strategies";
import { registerStrategyProfilesRoutes } from "./strategyProfiles";
import { registerOperationsRoutes } from "./operations";
import { registerStatementsRoutes } from "./statements";
import { registerSecurityRoutes } from "./security";
import { registerNotificationsRoutes } from "./notifications";
import { registerAnalyticsRoutes } from "./analytics";
import { registerInvestRoutes } from "./invest";
import { registerTelegramRoutes } from "./telegram";
import { registerCoreRoutes } from "./core";
import { registerStatusRoutes } from "./status";

export function registerExtractedRoutes(deps: RouteDeps): void {
  // Register routes in the same order as original file
  registerCoreRoutes(deps);
  registerStrategiesRoutes(deps);
  registerStrategyProfilesRoutes(deps);
  registerOperationsRoutes(deps);
  registerStatementsRoutes(deps);
  registerSecurityRoutes(deps);
  registerNotificationsRoutes(deps);
  registerAnalyticsRoutes(deps);
  registerInvestRoutes(deps);
  registerTelegramRoutes(deps);
  registerStatusRoutes(deps);
}

export type { RouteDeps };
