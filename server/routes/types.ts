import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";

export interface RouteDeps {
  app: Express;
  isAuthenticated: (req: Request, res: Response, next: NextFunction) => void;
  devOnly: (req: Request, res: Response, next: NextFunction) => void;
  getUserId: (req: Request) => string;
}

export type RouteRegistrar = (deps: RouteDeps) => void;
