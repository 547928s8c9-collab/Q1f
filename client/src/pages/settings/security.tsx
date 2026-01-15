import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { SecuritySettingRow } from "@/components/security/security-setting-row";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type BootstrapResponse, type WhitelistAddress } from "@shared/schema";
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
import { Shield, KeyRound, ListChecks, Clock, Eye, Plus, Trash2 } from "lucide-react";

export default function SecuritySettings() {
  const { toast } = useToast();
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

  const isLoading = bootstrapLoading || whitelistLoading;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Security Center" subtitle="Manage your security settings" backHref="/settings" />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="divide-y divide-border">
            <div className="p-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Authentication</h3>
            </div>
            <SecuritySettingRow
              icon={<Shield className="w-5 h-5 text-muted-foreground" />}
              label="Two-Factor Authentication"
              description="Add an extra layer of security to your account"
              type="toggle"
              value={bootstrap?.security.twoFactorEnabled}
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

          <Card className="divide-y divide-border">
            <div className="p-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Withdrawal Security</h3>
            </div>
            <SecuritySettingRow
              icon={<ListChecks className="w-5 h-5 text-muted-foreground" />}
              label="Address Whitelist"
              description="Only allow withdrawals to approved addresses"
              type="toggle"
              value={bootstrap?.security.whitelistEnabled}
              onChange={(enabled) => toggleWhitelistMutation.mutate(enabled)}
            />
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
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

          <Card>
            <div className="p-4 flex items-center justify-between border-b border-border">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Whitelist Addresses</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddAddressDialog(true)}
                data-testid="button-add-address"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Address
              </Button>
            </div>
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
              <div className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No whitelisted addresses</p>
              </div>
            )}
          </Card>
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
