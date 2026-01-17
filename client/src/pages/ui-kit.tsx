import { useSetPageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";

export default function UIKit() {
  useSetPageTitle("UI Kit");

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="brand">Brand</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Badges & Chips</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Primary</Badge>
          <Badge variant="brand">Brand</Badge>
          <Chip variant="success">Success</Chip>
          <Chip variant="warning">Warning</Chip>
          <Chip variant="danger">Danger</Chip>
          <Chip variant="primary">Primary</Chip>
          <Chip variant="brand">Brand</Chip>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Inputs</h2>
        <div className="grid gap-3 max-w-md">
          <Input placeholder="Regular input" />
          <Input type="search" placeholder="Search input" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cards</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Surface card</p>
            <p className="text-lg font-semibold mt-2">Anthropic palette</p>
          </Card>
          <MetricCard label="Net Yield" value="$12,480" change="+3.2%" trend="positive" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Status badges</h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="pending" />
          <StatusBadge status="processing" />
          <StatusBadge status="completed" />
          <StatusBadge status="failed" />
          <StatusBadge status="cancelled" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Surface sample</h2>
        <div className="rounded-lg border border-border bg-surface2 p-4 text-sm text-muted-foreground">
          Surface2 block uses warm neutrals with readable muted text.
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Safe area</h2>
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted-foreground">
          Bottom nav padding respects safe-area and avoids overlap.
        </div>
      </section>
    </div>
  );
}
