import { Link, useLocation } from "wouter";
import { Home, TrendingUp, Wallet, Activity, Settings, LogOut, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { GlobalBanner } from "@/components/global-banner";
import { PageProvider, usePageTitle } from "@/contexts/page-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/invest", label: "Invest", icon: TrendingUp },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

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

function TopBar() {
  const { title } = usePageTitle();
  const { user } = useAuth();
  const initials = user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || "U";

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-3 bg-background border-b border-border sticky top-0 z-[999]">
      <div className="flex items-center gap-3">
        <h1 
          className="text-lg font-semibold tracking-tight md:hidden"
          data-testid="text-page-title"
        >
          {title}
        </h1>
        <h1 
          className="hidden md:block text-xl font-semibold tracking-tight"
          data-testid="text-page-title-desktop"
        >
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <ThemeToggle />
        <Link href="/settings">
          <Avatar className="h-8 w-8 cursor-pointer hover-elevate" data-testid="button-avatar">
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}

function MobileBottomNav() {
  const [location] = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 safe-area-pb">
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
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex min-h-screen w-full bg-background">
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-h-screen w-full">
          <TopBar />
          <GlobalBanner />
          <main className="flex-1 pb-20 md:pb-0 overflow-auto">
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
      <AppShellContent>{children}</AppShellContent>
    </PageProvider>
  );
}
