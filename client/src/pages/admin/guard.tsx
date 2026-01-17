import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

interface AdminMeResponse {
  ok: boolean;
  admin?: {
    id: string;
    email: string;
    isSuperAdmin: boolean;
  };
}

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError } = useQuery<AdminMeResponse>({
    queryKey: ["/api/admin/auth/me"],
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!isLoading && (!data || !data.ok || isError)) {
      setLocation("/admin/login");
    }
  }, [data, isError, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.ok) {
    return null;
  }

  return <>{children}</>;
}
