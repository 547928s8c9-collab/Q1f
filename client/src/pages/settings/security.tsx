import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Shield, ListChecks, Clock, Eye, Plus, Trash2, Wallet, Bell, Mail, MessageCircle, Loader2, Link2 } from "lucide-react";
import { useLocation } from "wouter";

interface TelegramNotificationStatus {
  linked: boolean;
  enabled: boolean;
}

export default function SecuritySettings() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [antiPhishingDialog, setAntiPhishingDialog] = useState(false);
  const [addAddressDialog, setAddAddressDialog] = useState(false);
  const [antiPhishingCode, setAntiPhishingCode] = useState("");
  const [newAddress, setNewAddress] = useState({ address: "", label: "" });
  const [addressFormError, setAddressFormError] = useState("");
  const [antiPhishingError, setAntiPhishingError] = useState("");

  const { data: bootstrap, isLoading: bootstrapLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const { data: whitelist, isLoading: whitelistLoading } = useQuery<WhitelistAddress[]>({
    queryKey: ["/api/security/whitelist"],
  });

  const { data: notifPrefs, isLoading: notifPrefsLoading } = useQuery<NotificationPreferences>({
    queryKey: ["/api/notification-preferences"],
  });

  const { data: telegramStatus, isLoading: telegramStatusLoading } = useQuery<TelegramNotificationStatus>({
    queryKey: ["/api/telegram/notifications/status"],
  });

  const [localNotifPrefs, setLocalNotifPrefs] = useState<Partial<NotificationPreferences>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSavingNotifs, setIsSavingNotifs] = useState(false);

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
      if (notifPrefs) {
        setLocalNotifPrefs({
          inAppEnabled: notifPrefs.inAppEnabled,
          emailEnabled: notifPrefs.emailEnabled,
          telegramEnabled: notifPrefs.telegramEnabled,
        });
      }
    },
  });

  const toggleTelegramMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const endpoint = enabled ? "/api/telegram/notifications/enable" : "/api/telegram/notifications/disable";
      return apiRequest("POST", endpoint, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram/notifications/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] });
      toast({ title: "Telegram уведомления обновлены" });
    },
    onError: (error: Error) => {
      toast({ title: "Не удалось обновить Telegram", description: error.message, variant: "destructive" });
    },
  });

  const handleNotifToggle = useCallback((key: keyof NotificationPreferences, value: boolean) => {
    setLocalNotifPrefs((prev) => ({ ...prev, [key]: value }));
    setIsSavingNotifs(true);

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
      toast({ title: "Настройки 2FA обновлены" });
    },
    onError: (error: Error) => {
      toast({ title: "Не удалось обновить 2FA", description: error.message, variant: "destructive" });
    },
  });

  const toggleWhitelistMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("POST", "/api/security/whitelist/toggle", { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: "Настройки белого списка обновлены" });
    },
    onError: (error: Error) => {
      toast({ title: "Не удалось обновить белый список", description: error.message, variant: "destructive" });
    },
  });

  const setAddressDelayMutation = useMutation({
    mutationFn: async (delay: number) => {
      return apiRequest("POST", "/api/security/address-delay", { delay });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: "Задержка для адреса обновлена" });
    },
    onError: (error: Error) => {
      toast({ title: "Не удалось обновить задержку", description: error.message, variant: "destructive" });
    },
  });

  const setAntiPhishingMutation = useMutation({
    mutationFn: async (code: string) => {
      return apiRequest("POST", "/api/security/anti-phishing", { code });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: "Антифишинговый код обновлён" });
      setAntiPhishingDialog(false);
      setAntiPhishingCode("");
      setAntiPhishingError("");
    },
  });

  const addAddressMutation = useMutation({
    mutationFn: async (data: { address: string; label: string }) => {
      return apiRequest("POST", "/api/security/whitelist/add", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security/whitelist"] });
      toast({ title: "Адрес добавлен в белый список" });
      setAddAddressDialog(false);
      setNewAddress({ address: "", label: "" });
      setAddressFormError("");
    },
    onError: (error: Error) => {
      toast({ title: "Не удалось добавить адрес", description: error.message, variant: "destructive" });
    },
  });

  const removeAddressMutation = useMutation({
    mutationFn: async (addressId: string) => {
      return apiRequest("POST", "/api/security/whitelist/remove", { addressId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security/whitelist"] });
      toast({ title: "Адрес удалён из белого списка" });
    },
  });

  const isLoading = bootstrapLoading || whitelistLoading || notifPrefsLoading || telegramStatusLoading;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Центр безопасности" subtitle="Управление настройками безопасности" backHref="/settings" />

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
            <SectionHeader title="Статус верификации" />
            <KycStatusCard
              status={(bootstrap?.security.kycStatus as any) || "not_started"}
              onStartVerification={() => navigate("/onboarding/kyc")}
            />
          </section>

          <section>
            <SectionHeader title="Аутентификация" />
            <Card className="divide-y divide-border">
              <SecuritySettingRow
                icon={<Shield className="w-5 h-5 text-muted-foreground" />}
                label="Двухфакторная аутентификация"
                description="Добавьте дополнительный уровень защиты аккаунта"
                type="toggle"
                value={bootstrap?.security.twoFactorEnabled ?? false}
                onChange={(enabled) => toggle2FAMutation.mutate(enabled)}
                disabled={toggle2FAMutation.isPending}
              />
              <SecuritySettingRow
                icon={<Eye className="w-5 h-5 text-muted-foreground" />}
                label="Антифишинговый код"
                description={bootstrap?.security.antiPhishingCode ? `Код: ${bootstrap.security.antiPhishingCode}` : "Установите код для проверки подлинности писем"}
                type="action"
                onClick={() => setAntiPhishingDialog(true)}
              />
            </Card>
          </section>

          <section>
            <SectionHeader title="Безопасность вывода" />
            <Card className="divide-y divide-border">
              <SecuritySettingRow
                icon={<ListChecks className="w-5 h-5 text-muted-foreground" />}
                label="Белый список адресов"
                description="Разрешить вывод только на одобренные адреса"
                type="toggle"
                value={bootstrap?.security.whitelistEnabled ?? false}
                onChange={(enabled) => toggleWhitelistMutation.mutate(enabled)}
                disabled={toggleWhitelistMutation.isPending}
              />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Задержка нового адреса</p>
                      <p className="text-xs text-muted-foreground">Период ожидания для новых адресов</p>
                    </div>
                  </div>
                  <Select
                    value={String(bootstrap?.security.addressDelay || 0)}
                    onValueChange={(value) => setAddressDelayMutation.mutate(parseInt(value))}
                    disabled={setAddressDelayMutation.isPending}
                  >
                    <SelectTrigger className="w-32" data-testid="select-address-delay">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Без задержки</SelectItem>
                      <SelectItem value="24">24 часа</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader 
              title="Адреса белого списка"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddAddressDialog(true)}
                  data-testid="button-add-address"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Добавить
                </Button>
              }
            />
            <Card>
            {whitelist && whitelist.length > 0 ? (
              <div className="divide-y divide-border">
                {whitelist.map((addr) => (
                  <div key={addr.id} className="flex items-center justify-between p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{addr.label || "Без названия"}</p>
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
                <p className="text-sm text-muted-foreground" data-testid="text-empty-whitelist">Нет адресов в белом списке</p>
                <p className="text-xs text-muted-foreground mt-1">Добавьте адреса для безопасного вывода средств</p>
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
              <div className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Telegram уведомления</p>
                    <p className="text-xs text-muted-foreground">
                      Получать важные уведомления в личном чате с ботом
                    </p>
                  </div>
                  <Switch
                    checked={telegramStatus?.enabled ?? false}
                    disabled={!telegramStatus?.linked || toggleTelegramMutation.isPending}
                    onCheckedChange={(enabled) => toggleTelegramMutation.mutate(enabled)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-14">
                  <Badge variant="outline" className={telegramStatus?.linked ? "border-positive/30 text-positive" : "border-muted text-muted-foreground"}>
                    <span className="flex items-center gap-2">
                      <span className={telegramStatus?.linked ? "w-1.5 h-1.5 rounded-full bg-positive" : "w-1.5 h-1.5 rounded-full bg-muted-foreground"} />
                      {telegramStatus?.linked ? "Привязан" : "Не привязан"}
                    </span>
                  </Badge>
                  {telegramStatus?.linked ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => toggleTelegramMutation.mutate(!(telegramStatus?.enabled ?? false))}
                      disabled={toggleTelegramMutation.isPending}
                      className="h-8"
                    >
                      {telegramStatus?.enabled ? "Отключить" : "Включить"}
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" disabled className="h-8 gap-2">
                      <Link2 className="w-3.5 h-3.5" />
                      Откройте /tg и привяжите аккаунт
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </section>
        </div>
      )}

      <Dialog open={antiPhishingDialog} onOpenChange={setAntiPhishingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Антифишинговый код</DialogTitle>
            <DialogDescription>
              Установите уникальный код, который будет отображаться во всех наших письмах для подтверждения подлинности.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="anti-phishing-code">Код</Label>
              <Input
                id="anti-phishing-code"
                placeholder="например, MYCODE123"
                value={antiPhishingCode}
                onChange={(e) => setAntiPhishingCode(e.target.value)}
                className="mt-2"
                data-testid="input-anti-phishing-code"
              />
            </div>
            {antiPhishingError && (
              <p className="text-sm text-destructive">{antiPhishingError}</p>
            )}
            <Button
              className="w-full"
              onClick={() => {
                setAntiPhishingError("");
                const code = antiPhishingCode.trim();
                if (code.length < 4) {
                  setAntiPhishingError("Минимальная длина кода — 4 символа");
                  return;
                }
                if (code.length > 32) {
                  setAntiPhishingError("Максимальная длина кода — 32 символа");
                  return;
                }
                setAntiPhishingMutation.mutate(code);
              }}
              disabled={setAntiPhishingMutation.isPending || !antiPhishingCode}
              data-testid="button-save-anti-phishing"
            >
              Сохранить код
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addAddressDialog} onOpenChange={setAddAddressDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить адрес в белый список</DialogTitle>
            <DialogDescription>
              Добавьте новый адрес в белый список для вывода средств.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="address-label">Название</Label>
              <Input
                id="address-label"
                placeholder="например, Мой Binance"
                value={newAddress.label}
                onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                className="mt-2"
                data-testid="input-address-label"
              />
            </div>
            <div>
              <Label htmlFor="address">Адрес (TRC20)</Label>
              <Input
                id="address"
                placeholder="T..."
                value={newAddress.address}
                onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
                className="mt-2 font-mono"
                data-testid="input-whitelist-address"
              />
            </div>
            {addressFormError && (
              <p className="text-sm text-destructive">{addressFormError}</p>
            )}
            <Button
              className="w-full"
              onClick={() => {
                setAddressFormError("");
                const addr = newAddress.address.trim();
                if (!addr) {
                  setAddressFormError("Введите адрес кошелька");
                  return;
                }
                if (!addr.startsWith("T") || addr.length !== 34) {
                  setAddressFormError("Некорректный TRC20-адрес (должен начинаться с T и содержать 34 символа)");
                  return;
                }
                addAddressMutation.mutate({ ...newAddress, address: addr });
              }}
              disabled={addAddressMutation.isPending || !newAddress.address}
              data-testid="button-add-whitelist-address"
            >
              Добавить адрес
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
