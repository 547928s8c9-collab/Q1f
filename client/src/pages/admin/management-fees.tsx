import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Check, X, AlertCircle } from "lucide-react";

type FeeType = "profit" | "aum";
type BillingCycle = "monthly" | "on_withdrawal";

interface TierFeeConfig {
  feeType: FeeType;
  feePercent: number;
  billingCycle: BillingCycle;
}

interface ManagementFeeConfig {
  tiers: {
    stable: TierFeeConfig;
    active: TierFeeConfig;
    aggressive: TierFeeConfig;
  };
  updatedAt: string;
}

type TierKey = keyof ManagementFeeConfig["tiers"];

const TIER_LABELS: Record<TierKey, string> = {
  stable: "Stable",
  active: "Active",
  aggressive: "Aggressive",
};

const FEE_TYPE_LABELS: Record<FeeType, string> = {
  profit: "% от прибыли",
  aum: "% от баланса (AUM)",
};

const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "Ежемесячно",
  on_withdrawal: "При выводе",
};

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...opts });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error?.message || "Request failed");
  return json.data as T;
}

export default function AdminManagementFees() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<ManagementFeeConfig>({
    queryKey: ["/api/admin/management-fees"],
    queryFn: () => apiFetch<ManagementFeeConfig>("/api/admin/management-fees"),
  });

  const mutation = useMutation({
    mutationFn: (tiers: ManagementFeeConfig["tiers"]) =>
      apiFetch<ManagementFeeConfig>("/api/admin/management-fees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiers }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/management-fees"] });
      toast({ title: "Сохранено", description: "Конфигурация комиссий обновлена." });
      setEditingTier(null);
      setDraft(null);
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    },
  });

  const [editingTier, setEditingTier] = useState<TierKey | null>(null);
  const [draft, setDraft] = useState<TierFeeConfig | null>(null);

  function startEdit(tier: TierKey) {
    if (!data) return;
    setDraft({ ...data.tiers[tier] });
    setEditingTier(tier);
  }

  function cancelEdit() {
    setEditingTier(null);
    setDraft(null);
  }

  function saveEdit() {
    if (!data || !editingTier || !draft) return;
    const updatedTiers = { ...data.tiers, [editingTier]: draft };
    mutation.mutate(updatedTiers);
  }

  const tierOrder: TierKey[] = ["stable", "active", "aggressive"];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" data-testid="text-management-fees-title">
          Комиссии управляющего
        </h1>
      </div>

      {error && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p>Не удалось загрузить конфигурацию комиссий.</p>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Тир</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Тип комиссии</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Размер %</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Период</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Действия</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? tierOrder.map((t) => (
                    <tr key={t} className="border-b">
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-8 w-16 ml-auto" /></td>
                    </tr>
                  ))
                : tierOrder.map((tier) => {
                    const config = data!.tiers[tier];
                    const isEditing = editingTier === tier;

                    return (
                      <tr
                        key={tier}
                        className="border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                        data-testid={`row-tier-${tier}`}
                      >
                        <td className="px-4 py-3 font-medium">{TIER_LABELS[tier]}</td>

                        <td className="px-4 py-3">
                          {isEditing ? (
                            <Select
                              value={draft!.feeType}
                              onValueChange={(v) => setDraft({ ...draft!, feeType: v as FeeType })}
                            >
                              <SelectTrigger className="w-44">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="profit">% от прибыли</SelectItem>
                                <SelectItem value="aum">% от баланса (AUM)</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            FEE_TYPE_LABELS[config.feeType]
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing ? (
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={draft!.feePercent}
                              onChange={(e) =>
                                setDraft({ ...draft!, feePercent: parseFloat(e.target.value) || 0 })
                              }
                              className="w-20"
                              data-testid={`input-fee-percent-${tier}`}
                            />
                          ) : (
                            <span className="font-semibold">{config.feePercent}%</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing ? (
                            <Select
                              value={draft!.billingCycle}
                              onValueChange={(v) =>
                                setDraft({ ...draft!, billingCycle: v as BillingCycle })
                              }
                            >
                              <SelectTrigger className="w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="monthly">Ежемесячно</SelectItem>
                                <SelectItem value="on_withdrawal">При выводе</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            BILLING_CYCLE_LABELS[config.billingCycle]
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {isEditing ? (
                              <>
                                <Button
                                  size="sm"
                                  onClick={saveEdit}
                                  disabled={mutation.isPending}
                                  data-testid={`button-save-${tier}`}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Сохранить
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelEdit}
                                  disabled={mutation.isPending}
                                  data-testid={`button-cancel-${tier}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEdit(tier)}
                                disabled={editingTier !== null}
                                data-testid={`button-edit-${tier}`}
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                Изменить
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {data && (
          <div className="px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground" data-testid="text-last-updated">
            Последнее обновление:{" "}
            {new Date(data.updatedAt).toLocaleString("ru-RU", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
