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
    mutationFn: async (patch: Partial<NotificationPreferences>) => {
      return apiRequest("PUT", "/api/notification-preferences", patch);
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

  const handleNotifToggle = useCallback((key: keyof NotificationPreferences, value: boolean) => {
    // Optimistic update
    setLocalNotifPrefs((prev) => ({ ...prev, [key]: value }));
    setIsSavingNotifs(true);

    // Debounce the API call
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      updateNotifPrefsMutation.mutate({ [key]: value });
    }, 400);
  }, [updateNotifPrefsMutation]);

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
    mutationFn: async (enabled: boolean) => {
      return apiRequest("POST", "/api/security/whitelist/toggle", { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: "Whitelist settings updated" });
    },
  });

  const setAddressDelayMutation = useMutation({
    mutationFn: async (delay: number) => {
      return apiRequest("POST", "/api/security/address-delay", { delay });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: "Address delay updated" });
    },
  });

  const setAntiPhishingMutation = useMutation({
    mutationFn: async (code: string) => {
      return apiRequest("POST", "/api/security/anti-phishing", { code });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: "Anti-phishing code updated" });
      setAntiPhishingDialog(false);
      setAntiPhishingCode("");
    },
  });

  const addAddressMutation = useMutation({
    mutationFn: async (data: { address: string; label: string }) => {
      return apiRequest("POST", "/api/security/whitelist/add", data);
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
    mutationFn: async (addressId: string) => {
      return apiRequest("POST", "/api/security/whitelist/remove", { addressId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security/whitelist"] });
      toast({ title: "Address removed from whitelist" });
    },
  });

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
                onChange={(enabled) => toggleWhitelistMutation.mutate(enabled)}
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
                    onValueChange={(value) => setAddressDelayMutation.mutate(parseInt(value))}
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
                        onClick={() => removeAddressMutation.mutate(addr.id)}
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
              onClick={() => setAntiPhishingMutation.mutate(antiPhishingCode)}
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
              onClick={() => addAddressMutation.mutate(newAddress)}
              disabled={addAddressMutation.isPending || !newAddress.address}
              data-testid="button-add-whitelist-address"
            >
              Add Address
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
