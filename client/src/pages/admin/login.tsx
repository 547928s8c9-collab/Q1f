import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert } from "lucide-react";

interface AdminMeResponse {
  ok: boolean;
  admin?: {
    id: string;
    email: string;
    isSuperAdmin: boolean;
  };
}

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: adminMe, isLoading: adminLoading } = useQuery<AdminMeResponse>({
    queryKey: ["/api/admin/auth/me"],
    refetchInterval: false,
  });

  useEffect(() => {
    if (adminMe?.ok) {
      setLocation("/admin");
    }
  }, [adminMe, setLocation]);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Login failed");
      }
      return data;
    },
    onSuccess: () => {
      setErrorMessage(null);
      setLocation("/admin");
    },
    onError: (err: Error) => {
      setErrorMessage(err.message);
    },
  });

  const isBusy = loginMutation.isPending || adminLoading;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Admin Login</h1>
            <p className="text-sm text-muted-foreground">Sign in to the admin console</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Password</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {errorMessage && (
            <div className="text-sm text-destructive">{errorMessage}</div>
          )}
        </div>

        <Button
          className="w-full"
          onClick={() => loginMutation.mutate()}
          disabled={isBusy || !email || !password}
          data-testid="button-admin-login"
        >
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
        </Button>
      </Card>
    </div>
  );
}
