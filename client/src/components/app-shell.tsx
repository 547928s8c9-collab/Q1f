import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { TrendingUp, Wallet, Settings, LogOut, Smartphone, Monitor, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { GlobalBanner } from "@/components/global-banner";
import { DemoModeBanner } from "@/components/admin/demo-mode-banner";
import { PageProvider, usePageTitle } from "@/contexts/page-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDemoDataSeeder } from "@/hooks/use-demo-data-seeder";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarFooter,
} from "@/components/ui/sidebar";

const FORCE_MOBILE_KEY = "zeon-force-mobile-view";

interface ForceMobileContextValue {
  forceMobile: boolean;
  toggleForceMobile: () => void;
  isNativeMobile: boolean;
}

const ForceMobileContext = createContext<ForceMobileContextValue>({
  forceMobile: false,
  toggleForceMobile: () => {},
  isNativeMobile: false,
});

function useForceMobile() {
  return useContext(ForceMobileContext);
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== "undefined") return window.matchMedia(query).matches;
    return false;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

function ForceMobileProvider({ children }: { children: React.ReactNode }) {
  const [forceMobile, setForceMobile] = useState(() => {
    try {
      return localStorage.getItem(FORCE_MOBILE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const isNativeMobile = !useMediaQuery("(min-width: 768px)");

  const toggleForceMobile = useCallback(() => {
    setForceMobile((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(FORCE_MOBILE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  return (
    <ForceMobileContext.Provider value={{ forceMobile, toggleForceMobile, isNativeMobile }}>
      {children}
    </ForceMobileContext.Provider>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { href: "/", label: "Портфель", icon: Wallet },
  { href: "/strategies", label: "Стратегии", icon: TrendingUp },
  { href: "/profile", label: "Профиль", icon: User },
];

function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { toggleForceMobile } = useForceMobile();

  return (
    <Sidebar>
      <SidebarHeader className="p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-sidebar-foreground">ZEON</h1>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="min-h-[44px]"
                    >
                      <Link href={item.href}>
                        <Icon className="w-[18px] h-[18px]" />
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border space-y-3">
        {user && (
          <div className="px-2">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user.firstName || user.email?.split("@")[0]}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={toggleForceMobile}
          data-testid="button-switch-mobile"
        >
          <Smartphone className="h-4 w-4" />
          <span className="text-xs">Мобильная версия</span>
        </Button>
        <div className="flex items-center justify-between gap-2">
          <NotificationBell />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function TopBar({ demoBadge }: { demoBadge?: boolean }) {
  const { title } = usePageTitle();
  const { user, logout } = useAuth();
  const { forceMobile, toggleForceMobile, isNativeMobile } = useForceMobile();
  const [location, navigate] = useLocation();
  const initials = user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || "U";
  const showMobileLayout = forceMobile || isNativeMobile;
  const showDesktopButton = forceMobile && !isNativeMobile;

  // On strategies page, show minimal Apple-style header: title + avatar only
  const isStrategiesPage = location === "/strategies" || location === "/invest";

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-3 bg-background/80 backdrop-blur-xl border-b border-border/50 sticky top-0 z-[999]">
      <div className="flex items-center gap-2">
        {showMobileLayout ? (
          <h1
            className="text-lg font-semibold tracking-tight"
            data-testid="text-page-title"
          >
            {title}
          </h1>
        ) : (
          <h1
            className="text-xl font-semibold tracking-tight"
            data-testid="text-page-title-desktop"
          >
            {title}
          </h1>
        )}
        {demoBadge && <DemoModeBanner isDemo />}
      </div>
      <div className="flex items-center gap-2">
        {showDesktopButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleForceMobile}
            data-testid="button-switch-desktop"
            title="Десктопная версия"
            aria-label="Десктопная версия"
          >
            <Monitor className="h-4 w-4" />
          </Button>
        )}
        {!isStrategiesPage && <NotificationBell />}
        {!isStrategiesPage && <ThemeToggle />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="outline-none" data-testid="button-avatar">
              <Avatar className="h-8 w-8 cursor-pointer hover-elevate">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate("/settings/profile")} data-testid="menu-profile">
              <User className="mr-2 h-4 w-4" />
              Профиль
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-settings">
              <Settings className="mr-2 h-4 w-4" />
              Настройки
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => logout()} data-testid="menu-logout">
              <LogOut className="mr-2 h-4 w-4" />
              Выход
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function MobileBottomNav() {
  const [location] = useLocation();
  const { forceMobile, isNativeMobile } = useForceMobile();
  const showMobileLayout = forceMobile || isNativeMobile;

  if (!showMobileLayout) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t border-border/50 z-50 safe-area-pb">
      <div className="flex justify-around items-center h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[64px] transition-colors",
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground active:text-foreground"
                )}
                data-testid={`mobile-nav-${item.label.toLowerCase()}`}
              >
                <Icon className={cn("w-6 h-6", isActive && "stroke-[2.5px]")} />
                <span className={cn(
                  "text-[11px]",
                  isActive ? "font-semibold" : "font-medium"
                )}>
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

interface AppShellProps {
  children: React.ReactNode;
}

function AppShellContent({ children }: AppShellProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { forceMobile, isNativeMobile } = useForceMobile();
  useDemoDataSeeder();
  const isDemo = user?.email === "demo@example.com";
  const showDemoBanner = isDemo && !location.startsWith("/admin");
  const showMobileLayout = forceMobile || isNativeMobile;

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex min-h-screen w-full bg-background">
        {!showMobileLayout && (
          <div className="hidden md:block">
            <AppSidebar />
          </div>
        )}
        <div className="flex-1 flex flex-col min-h-screen w-full">
          <TopBar demoBadge={showDemoBanner} />
          <GlobalBanner />
          <main className={cn("flex-1 overflow-auto", showMobileLayout ? "pb-20" : "pb-0")}>
            {children}
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </SidebarProvider>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <PageProvider>
      <ForceMobileProvider>
        <AppShellContent>{children}</AppShellContent>
      </ForceMobileProvider>
    </PageProvider>
  );
}
