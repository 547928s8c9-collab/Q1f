import { usePageTitle } from "@/contexts/page-context";

export default function PortfolioPage() {
  usePageTitle("Портфель");

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Портфель</h2>
      <p className="text-muted-foreground">
        Здесь будет объединённый обзор баланса, панели и кошелька.
      </p>
    </div>
  );
}
