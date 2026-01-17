import type { Express, Request, Response, NextFunction } from "express";
import type { RouteDeps } from "./types";

import { registerStrategiesRoutes } from "./strategies";
import { registerOperationsRoutes } from "./operations";
import { registerStatementsRoutes } from "./statements";
import { registerSecurityRoutes } from "./security";
import { registerNotificationsRoutes } from "./notifications";

export function registerExtractedRoutes(deps: RouteDeps): void {
  // Register routes in the same order as original file
  registerStrategiesRoutes(deps);
  registerOperationsRoutes(deps);
  registerStatementsRoutes(deps);
  registerSecurityRoutes(deps);
  registerNotificationsRoutes(deps);
}

export type { RouteDeps };
