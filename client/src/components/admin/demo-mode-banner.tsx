interface DemoModeBannerProps {
  isDemo: boolean;
}

export function DemoModeBanner({ isDemo }: DemoModeBannerProps) {
  if (!isDemo) return null;

  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-warning/20 text-warning"
      data-testid="badge-demo-mode"
    >
      DEMO
    </span>
  );
}
