import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { SecuritySettingRow } from "@/components/security/security-setting-row";
import { KycStatusCard } from "@/components/security/kyc-status-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type BootstrapResponse, type WhitelistAddress, type NotificationPreferences } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, ListChecks, Clock, Eye, Plus, Trash2, Wallet, Bell, Mail, MessageCircle, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

export default function SecuritySettings() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [antiPhishingDialog, setAntiPhishingDialog] = useState(false);
  const [addAddressDialog, setAddAddressDialog] = useState(false);
  const [antiPhishingCode, setAntiPhishingCode] = useState("");
  const [newAddress, setNewAddress] = useState({ address: "", label: "" });
  const [twoFactorDialogOpen, setTwoFactorDialogOpen] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState("");
  const pendingTwoFactorResolver = useRef<((code: string | null) => void) | null>(null);

  const { data: bootstrap, isLoading: bootstrapLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const { data: whitelist, isLoading: whitelistLoading } = useQuery<WhitelistAddress[]>({
    queryKey: ["/api/security/whitelist"],
  });

  const { data: notifPrefs, isLoading: notifPrefsLoading } = useQuery<NotificationPreferences>({
    queryKey: ["/api/notification-preferences"],
  });

  // Local state for optimistic UI updates
  const [localNotifPrefs, setLocalNotifPrefs] = useState<Partial<NotificationPreferences>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSavingNotifs, setIsSavingNotifs] = useState(false);

  // Sync local state with server data
  useEffect(() => {
    if (notifPrefs) {
      setLocalNotifPrefs({
        inAppEnabled: notifPrefs.inAppEnabled,
        emailEnabled: notifPrefs.emailEnabled,
        telegramEnabled: notifPrefs.telegramEnabled,
      });
    }
  }, [notifPrefs]);

  const updateNotifPrefsMutation = useMutation({
    mutationFn: async ({
      patch,
      twoFactorCode,
    }: {
      patch: Partial<NotificationPreferences>;
      twoFactorCode?: string | null;
    }) => {
      return apiRequest("PUT", "/api/notification-preferences", patch, {
        headers: twoFactorCode ? { "x-2fa-code": twoFactorCode } : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] });
      setIsSavingNotifs(false);
    },
    onError: (error: Error) => {
      toast({ title: "Не удалось сохранить", description: error.message, variant: "destructive" });
      setIsSavingNotifs(false);
      // Revert to server state
      if (notifPrefs) {
        setLocalNotifPrefs({
          inAppEnabled: notifPrefs.inAppEnabled,
          emailEnabled: notifPrefs.emailEnabled,
          telegramEnabled: notifPrefs.telegramEnabled,
        });
      }
    },
  });

  const twoFactorEnabled = bootstrap?.security.twoFactorEnabled ?? false;

  const resolveTwoFactor = useCallback((value: string | null) => {
    if (pendingTwoFactorResolver.current) {
      pendingTwoFactorResolver.current(value);
      pendingTwoFactorResolver.current = null;
    }
    setTwoFactorDialogOpen(false);
  }, []);

  const requestTwoFactorCode = useCallback(() => {
    if (!twoFactorEnabled) {
      return Promise.resolve<string | null>(null);
    }
    setTwoFactorCode("");
    setTwoFactorError("");
    setTwoFactorDialogOpen(true);
    return new Promise<string | null>((resolve) => {
      pendingTwoFactorResolver.current = resolve;
    });
  }, [twoFactorEnabled]);

  const handleNotifToggle = useCallback(async (key: keyof NotificationPreferences, value: boolean) => {
    // Optimistic update
    setLocalNotifPrefs((prev) => ({ ...prev, [key]: value }));
    setIsSavingNotifs(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (twoFactorEnabled) {
      const code = await requestTwoFactorCode();
      if (!code) {
        setIsSavingNotifs(false);
        if (notifPrefs) {
          setLocalNotifPrefs({
            inAppEnabled: notifPrefs.inAppEnabled,
            emailEnabled: notifPrefs.emailEnabled,
            telegramEnabled: notifPrefs.telegramEnabled,
          });
        }
        return;
      }
      updateNotifPrefsMutation.mutate({ patch: { [key]: value }, twoFactorCode: code });
      return;
    }

    // Debounce the API call
    debounceRef.current = setTimeout(() => {
      updateNotifPrefsMutation.mutate({ patch: { [key]: value } });
    }, 400);
  }, [notifPrefs, requestTwoFactorCode, twoFactorEnabled, updateNotifPrefsMutation]);

  const toggle2FAMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("POST", "/api/security/2fa/toggle", { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: "2FA settings updated" });
    },
  });

  const toggleWhitelistMutation = useMutation({
    mutationFn: async ({ enabled, twoFactorCode }: { enabled: boolean; twoFactorCode?: string | null }) => {
      return apiRequest("POST", "/api/security/whitelist/toggle", { enabled }, {
        headers: twoFactorCode ? { "x-2fa-code": twoFactorCode } : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: "Whitelist settings updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update whitelist", description: error.message, variant: "destructive" });
    },
  });

  const setAddressDelayMutation = useMutation({
    mutationFn: async ({ delay, twoFactorCode }: { delay: number; twoFactorCode?: string | null }) => {
      return apiRequest("POST", "/api/security/address-delay", { delay }, {
        headers: twoFactorCode ? { "x-2fa-code": twoFactorCode } : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: "Address delay updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update delay", description: error.message, variant: "destructive" });
    },
  });

  const setAntiPhishingMutation = useMutation({
    mutationFn: async ({ code, twoFactorCode }: { code: string; twoFactorCode?: string | null }) => {
      return apiRequest("POST", "/api/security/anti-phishing", { code }, {
        headers: twoFactorCode ? { "x-2fa-code": twoFactorCode } : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: "Anti-phishing code updated" });
      setAntiPhishingDialog(false);
      setAntiPhishingCode("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update code", description: error.message, variant: "destructive" });
    },
  });

  const addAddressMutation = useMutation({
    mutationFn: async (data: { address: string; label: string; twoFactorCode?: string | null }) => {
      const { twoFactorCode, ...payload } = data;
      return apiRequest("POST", "/api/security/whitelist/add", payload, {
        headers: twoFactorCode ? { "x-2fa-code": twoFactorCode } : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security/whitelist"] });
      toast({ title: "Address added to whitelist" });
      setAddAddressDialog(false);
      setNewAddress({ address: "", label: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add address", description: error.message, variant: "destructive" });
    },
  });

  const removeAddressMutation = useMutation({
    mutationFn: async ({ addressId, twoFactorCode }: { addressId: string; twoFactorCode?: string | null }) => {
      return apiRequest("POST", "/api/security/whitelist/remove", { addressId }, {
        headers: twoFactorCode ? { "x-2fa-code": twoFactorCode } : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security/whitelist"] });
      toast({ title: "Address removed from whitelist" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove address", description: error.message, variant: "destructive" });
    },
  });

  const handleTwoFactorOpenChange = useCallback((open: boolean) => {
    if (!open && pendingTwoFactorResolver.current) {
      resolveTwoFactor(null);
      return;
    }
    setTwoFactorDialogOpen(open);
  }, [resolveTwoFactor]);

  const handleTwoFactorSubmit = useCallback(() => {
    if (!/^\d{6}$/.test(twoFactorCode)) {
      setTwoFactorError("Введите 6-значный код");
      return;
    }
    resolveTwoFactor(twoFactorCode);
  }, [resolveTwoFactor, twoFactorCode]);

  const handleWhitelistToggle = useCallback(async (enabled: boolean) => {
    const code = await requestTwoFactorCode();
    if (twoFactorEnabled && !code) {
      return;
    }
    toggleWhitelistMutation.mutate({ enabled, twoFactorCode: code });
  }, [requestTwoFactorCode, toggleWhitelistMutation, twoFactorEnabled]);

  const handleAddressDelayChange = useCallback(async (value: string) => {
    const code = await requestTwoFactorCode();
    if (twoFactorEnabled && !code) {
      return;
    }
    setAddressDelayMutation.mutate({ delay: parseInt(value), twoFactorCode: code });
  }, [requestTwoFactorCode, setAddressDelayMutation, twoFactorEnabled]);

  const handleAntiPhishingSave = useCallback(async () => {
    const code = await requestTwoFactorCode();
    if (twoFactorEnabled && !code) {
      return;
    }
    setAntiPhishingMutation.mutate({ code: antiPhishingCode, twoFactorCode: code });
  }, [antiPhishingCode, requestTwoFactorCode, setAntiPhishingMutation, twoFactorEnabled]);

  const handleAddAddress = useCallback(async () => {
    const code = await requestTwoFactorCode();
    if (twoFactorEnabled && !code) {
      return;
    }
    addAddressMutation.mutate({ ...newAddress, twoFactorCode: code });
  }, [addAddressMutation, newAddress, requestTwoFactorCode, twoFactorEnabled]);

  const handleRemoveAddress = useCallback(async (addressId: string) => {
    const code = await requestTwoFactorCode();
    if (twoFactorEnabled && !code) {
      return;
    }
    removeAddressMutation.mutate({ addressId, twoFactorCode: code });
  }, [removeAddressMutation, requestTwoFactorCode, twoFactorEnabled]);

  const isLoading = bootstrapLoading || whitelistLoading || notifPrefsLoading;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Security Center" subtitle="Manage your security settings" backHref="/settings" />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <SectionHeader title="Verification Status" />
            <KycStatusCard
              status={(bootstrap?.security.kycStatus as any) || "not_started"}
              onStartVerification={() => navigate("/onboarding/kyc")}
            />
          </section>

          <section>
            <SectionHeader title="Authentication" />
            <Card className="divide-y divide-border">
              <SecuritySettingRow
                icon={<Shield className="w-5 h-5 text-muted-foreground" />}
                label="Two-Factor Authentication"
                description="Add an extra layer of security to your account"
                type="toggle"
                value={bootstrap?.security.twoFactorEnabled ?? false}
                onChange={(enabled) => toggle2FAMutation.mutate(enabled)}
              />
              <SecuritySettingRow
                icon={<Eye className="w-5 h-5 text-muted-foreground" />}
                label="Anti-Phishing Code"
                description={bootstrap?.security.antiPhishingCode ? `Code: ${bootstrap.security.antiPhishingCode}` : "Set a code to verify emails"}
                type="action"
                onClick={() => setAntiPhishingDialog(true)}
              />
            </Card>
          </section>

          <section>
            <SectionHeader title="Withdrawal Security" />
            <Card className="divide-y divide-border">
              <SecuritySettingRow
                icon={<ListChecks className="w-5 h-5 text-muted-foreground" />}
                label="Address Whitelist"
                description="Only allow withdrawals to approved addresses"
                type="toggle"
                value={bootstrap?.security.whitelistEnabled ?? false}
                onChange={(enabled) => void handleWhitelistToggle(enabled)}
              />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">New Address Delay</p>
                      <p className="text-xs text-muted-foreground">Waiting period for new addresses</p>
                    </div>
                  </div>
                  <Select
                    value={String(bootstrap?.security.addressDelay || 0)}
                    onValueChange={(value) => void handleAddressDelayChange(value)}
                  >
                    <SelectTrigger className="w-32" data-testid="select-address-delay">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No delay</SelectItem>
                      <SelectItem value="24">24 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader 
              title="Whitelisted Addresses"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddAddressDialog(true)}
                  data-testid="button-add-address"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              }
            />
            <Card>
            {whitelist && whitelist.length > 0 ? (
              <div className="divide-y divide-border">
                {whitelist.map((addr) => (
                  <div key={addr.id} className="flex items-center justify-between p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{addr.label || "Unlabeled"}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{addr.address}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={addr.status || "pending"} />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleRemoveAddress(addr.id)}
                        data-testid={`button-remove-address-${addr.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center" data-testid="empty-state-whitelist">
                <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground" data-testid="text-empty-whitelist">No whitelisted addresses yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add addresses to enable secure withdrawals</p>
              </div>
            )}
            </Card>
          </section>

          <section>
            <SectionHeader 
              title="Уведомления"
              action={
                isSavingNotifs ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Сохранение...</span>
                  </div>
                ) : null
              }
            />
            <Card className="divide-y divide-border">
              <SecuritySettingRow
                icon={<Bell className="w-5 h-5 text-muted-foreground" />}
                label="In-app уведомления"
                description="Уведомления внутри приложения"
                type="toggle"
                value={localNotifPrefs.inAppEnabled ?? true}
                onChange={(enabled) => handleNotifToggle("inAppEnabled", enabled)}
              />
              <SecuritySettingRow
                icon={<Mail className="w-5 h-5 text-muted-foreground" />}
                label="Email уведомления"
                description="Получать уведомления на почту"
                type="toggle"
                value={localNotifPrefs.emailEnabled ?? false}
                onChange={(enabled) => handleNotifToggle("emailEnabled", enabled)}
              />
              <SecuritySettingRow
                icon={<MessageCircle className="w-5 h-5 text-muted-foreground" />}
                label="Telegram уведомления"
                description="Получать уведомления в Telegram"
                type="toggle"
                value={localNotifPrefs.telegramEnabled ?? false}
                onChange={(enabled) => handleNotifToggle("telegramEnabled", enabled)}
              />
            </Card>
          </section>
        </div>
      )}

      <Dialog open={antiPhishingDialog} onOpenChange={setAntiPhishingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anti-Phishing Code</DialogTitle>
            <DialogDescription>
              Set a unique code that will appear in all our emails to verify authenticity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="anti-phishing-code">Code</Label>
              <Input
                id="anti-phishing-code"
                placeholder="e.g., MYCODE123"
                value={antiPhishingCode}
                onChange={(e) => setAntiPhishingCode(e.target.value)}
                className="mt-2"
                data-testid="input-anti-phishing-code"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => void handleAntiPhishingSave()}
              disabled={setAntiPhishingMutation.isPending || !antiPhishingCode}
              data-testid="button-save-anti-phishing"
            >
              Save Code
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addAddressDialog} onOpenChange={setAddAddressDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Whitelist Address</DialogTitle>
            <DialogDescription>
              Add a new address to your withdrawal whitelist.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="address-label">Label</Label>
              <Input
                id="address-label"
                placeholder="e.g., My Binance"
                value={newAddress.label}
                onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                className="mt-2"
                data-testid="input-address-label"
              />
            </div>
            <div>
              <Label htmlFor="address">Address (TRC20)</Label>
              <Input
                id="address"
                placeholder="T..."
                value={newAddress.address}
                onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
                className="mt-2 font-mono"
                data-testid="input-whitelist-address"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => void handleAddAddress()}
              disabled={addAddressMutation.isPending || !newAddress.address}
              data-testid="button-add-whitelist-address"
            >
              Add Address
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={twoFactorDialogOpen} onOpenChange={handleTwoFactorOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подтверждение 2FA</DialogTitle>
            <DialogDescription>
              Введите одноразовый код, чтобы подтвердить изменения настроек безопасности.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="two-factor-code">Код 2FA</Label>
              <Input
                id="two-factor-code"
                inputMode="numeric"
                placeholder="123456"
                value={twoFactorCode}
                onChange={(e) => {
                  setTwoFactorCode(e.target.value.replace(/\s/g, ""));
                  setTwoFactorError("");
                }}
                className="mt-2 text-center font-mono tracking-[0.3em]"
              />
              {twoFactorError ? (
                <p className="text-xs text-destructive mt-2">{twoFactorError}</p>
              ) : null}
            </div>
            <Button
              className="w-full"
              onClick={handleTwoFactorSubmit}
              disabled={!twoFactorCode}
            >
              Подтвердить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
