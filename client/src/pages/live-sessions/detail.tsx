import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Activity, Shield, TrendingUp, Zap, Clock, Play, 
  Calendar, Gauge, AlertTriangle, Settings, Loader2 
} from "lucide-react";
import { format } from "date-fns";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ConfigSchemaField {
  type: "number" | "boolean";
  label: string;
  default: number | boolean;
  min?: number;
  max?: number;
  step?: number;
}

interface ConfigSchema {
  [key: string]: ConfigSchemaField | { [nestedKey: string]: ConfigSchemaField };
}

interface StrategyProfile {
  id: string;
  slug: string;
  displayName: string;
  symbol: string;
  timeframe: string;
  description: string;
  tags: string[];
  riskLevel: "low" | "medium" | "high";
  defaultConfig: Record<string, unknown>;
  configSchema: ConfigSchema;
}

interface GapInfo {
  from: number;
  to: number;
}

interface SessionCreateResponse {
  sessionId: string;
  status: string;
  streamUrl: string;
}

interface SessionCreateError {
  error: {
    code: string;
    message: string;
    gaps?: GapInfo[];
  };
}

const riskConfig: Record<string, { color: string; chipVariant: "success" | "warning" | "danger"; icon: React.ElementType; label: string }> = {
  low: { color: "bg-positive/10 text-positive", chipVariant: "success", icon: Shield, label: "Low Risk" },
  medium: { color: "bg-warning/10 text-warning", chipVariant: "warning", icon: TrendingUp, label: "Medium Risk" },
  high: { color: "bg-negative/10 text-negative", chipVariant: "danger", icon: Zap, label: "High Risk" },
};

const TIMEFRAME_MS: Record<string, number> = {
  "15m": 900000,
  "1h": 3600000,
  "1d": 86400000,
};

function DatePicker({ 
  date, 
  onSelect, 
  label 
}: { 
  date: Date | undefined; 
  onSelect: (date: Date | undefined) => void;
  label: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start text-left font-normal"
          data-testid={`datepicker-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span className="text-muted-foreground">Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarPicker
          mode="single"
          selected={date}
          onSelect={onSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function ConfigField({
  path,
  schema,
  value,
  onChange,
}: {
  path: string;
  schema: ConfigSchemaField;
  value: unknown;
  onChange: (path: string, value: unknown) => void;
}) {
  if (schema.type === "boolean") {
    return (
      <div className="flex items-center justify-between py-2">
        <Label htmlFor={path} className="text-sm">{schema.label}</Label>
        <Switch
          id={path}
          checked={value as boolean}
          onCheckedChange={(checked) => onChange(path, checked)}
          data-testid={`switch-${path}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={path} className="text-sm">{schema.label}</Label>
      <Input
        id={path}
        type="number"
        value={value as number}
        min={schema.min}
        max={schema.max}
        step={schema.step}
        onChange={(e) => onChange(path, parseFloat(e.target.value) || 0)}
        data-testid={`input-${path}`}
      />
    </div>
  );
}

function ConfigSection({
  title,
  schema,
  config,
  onChange,
  basePath = "",
}: {
  title?: string;
  schema: ConfigSchema;
  config: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
  basePath?: string;
}) {
  const isNestedObject = (val: unknown): val is { [key: string]: ConfigSchemaField } => {
    return typeof val === "object" && val !== null && !("type" in val);
  };

  return (
    <div className="space-y-3">
      {title && <h4 className="text-sm font-medium text-foreground">{title}</h4>}
      {Object.entries(schema).map(([key, fieldSchema]) => {
        const path = basePath ? `${basePath}.${key}` : key;
        const configValue = basePath 
          ? (config[basePath.split(".")[0]] as Record<string, unknown>)?.[key]
          : config[key];

        if (isNestedObject(fieldSchema)) {
          return (
            <div key={key} className="pl-3 border-l-2 border-border space-y-2">
              <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{key}</h5>
              <ConfigSection
                schema={fieldSchema as ConfigSchema}
                config={config}
                onChange={onChange}
                basePath={path}
              />
            </div>
          );
        }

        return (
          <ConfigField
            key={path}
            path={path}
            schema={fieldSchema as ConfigSchemaField}
            value={configValue ?? fieldSchema.default}
            onChange={onChange}
          />
        );
      })}
    </div>
  );
}

export default function LiveSessionDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [startDate, setStartDate] = useState<Date | undefined>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [speed, setSpeed] = useState(10);
  const [configOverride, setConfigOverride] = useState<Record<string, unknown>>({});
  const [gaps, setGaps] = useState<GapInfo[]>([]);
  const hasAdjustedRange = useRef(false);

  const { data: profile, isLoading, error } = useQuery<StrategyProfile>({
    queryKey: ["/api/strategy-profiles", slug],
    enabled: !!slug,
  });

  useSetPageTitle(profile?.displayName || "Strategy Details");

  useEffect(() => {
    if (!profile || !startDate || !endDate || hasAdjustedRange.current) return;
    const tfMs = TIMEFRAME_MS[profile.timeframe] || 900000;
    const minBarsWarmup = Number(profile.defaultConfig?.minBarsWarmup ?? 200);
    const minRangeMs = (minBarsWarmup + 10) * tfMs;
    const currentRange = endDate.getTime() - startDate.getTime();
    if (currentRange < minRangeMs) {
      setStartDate(new Date(endDate.getTime() - minRangeMs));
    }
    hasAdjustedRange.current = true;
  }, [profile, startDate, endDate]);

  const mergedConfig = useMemo(() => {
    if (!profile) return {};
    return { ...profile.defaultConfig, ...configOverride };
  }, [profile, configOverride]);

  const handleConfigChange = (path: string, value: unknown) => {
    const parts = path.split(".");
    setConfigOverride((prev) => {
      const newConfig = { ...prev };
      if (parts.length === 1) {
        newConfig[parts[0]] = value;
      } else if (parts.length === 2) {
        const [parent, child] = parts;
        newConfig[parent] = {
          ...(profile?.defaultConfig[parent] as Record<string, unknown>),
          ...(prev[parent] as Record<string, unknown>),
          [child]: value,
        };
      }
      return newConfig;
    });
  };

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      if (!profile || !startDate || !endDate) throw new Error("Missing required fields");
      
      const tfMs = TIMEFRAME_MS[profile.timeframe] || 900000;
      const startMs = Math.floor(startDate.getTime() / tfMs) * tfMs;
      const endMs = Math.floor(endDate.getTime() / tfMs) * tfMs;
      const minBarsWarmup = Number(profile.defaultConfig?.minBarsWarmup ?? 200);
      const minBarsRequired = minBarsWarmup + 10;
      const candleCount = (endMs - startMs) / tfMs;

      if (candleCount < minBarsRequired) {
        throw new Error(`Range must include at least ${minBarsRequired} candles for strategy warmup.`);
      }

      const configHash = JSON.stringify(configOverride).split("").reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);
      const res = await fetch("/api/sim/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `${slug}-${startMs}-${endMs}-${speed}-${configHash}`,
        },
        credentials: "include",
        body: JSON.stringify({
          profileSlug: slug,
          startMs,
          endMs,
          speed,
          configOverride: Object.keys(configOverride).length > 0 ? configOverride : undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json() as SessionCreateError;
        if (errorData.error?.code === "MARKET_DATA_GAPS" && errorData.error.gaps) {
          setGaps(errorData.error.gaps);
        }
        throw new Error(errorData.error?.message || "Failed to create session");
      }

      return res.json() as Promise<SessionCreateResponse>;
    },
    onSuccess: (data) => {
      toast({
        title: "Session started",
        description: "Redirecting to live view...",
      });
      setLocation(`/live-sessions/session/${data.sessionId}`);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to start session",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto pb-24">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-8 w-8" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Card className="p-6">
          <Skeleton className="h-64 w-full" />
        </Card>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto pb-24">
        <PageHeader title="Strategy Not Found" backHref="/live-sessions" />
        <Card className="p-8">
          <EmptyState
            icon={Activity}
            title="Strategy profile not found"
            description="The requested strategy profile does not exist."
          />
        </Card>
      </div>
    );
  }

  const config = riskConfig[profile.riskLevel] || riskConfig.medium;
  const Icon = config.icon;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto pb-24">
      <PageHeader
        title={profile.displayName}
        subtitle={`${profile.symbol} · ${profile.timeframe}`}
        backHref="/live-sessions"
      />

      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex items-start gap-4 mb-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${config.color}`}>
              <Icon className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap gap-1.5 mb-2">
                <Chip variant={config.chipVariant} size="sm">{config.label}</Chip>
                {profile.tags.map((tag) => (
                  <Chip key={tag} variant="outline" size="sm">{tag}</Chip>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{profile.description}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium">Session Period</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <DatePicker date={startDate} onSelect={setStartDate} label="Start Date" />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <DatePicker date={endDate} onSelect={setEndDate} label="End Date" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-muted-foreground" />
              <Label>Playback Speed</Label>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={speed}
                min={1}
                max={200}
                onChange={(e) => setSpeed(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-24"
                data-testid="input-speed"
              />
              <span className="text-sm text-muted-foreground">x (1-200)</span>
            </div>
          </div>
        </Card>

        {gaps.length > 0 && (
          <Card className="p-5 border-warning/50 bg-warning/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-warning mb-2">Market Data Gaps Detected</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  The selected period contains gaps in market data. Please adjust your date range.
                </p>
                <div className="space-y-1 text-sm">
                  {gaps.map((gap, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {format(new Date(gap.from), "MMM d, yyyy HH:mm")} -{" "}
                        {format(new Date(gap.to), "MMM d, yyyy HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium">Strategy Configuration</h3>
          </div>

          <ConfigSection
            schema={profile.configSchema}
            config={mergedConfig}
            onChange={handleConfigChange}
          />
        </Card>

        <Button
          size="lg"
          className="w-full"
          disabled={!startDate || !endDate || createSessionMutation.isPending}
          onClick={() => createSessionMutation.mutate()}
          data-testid="button-start-session"
        >
          {createSessionMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Starting Session...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start Live Session
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
