import { usePageTitle } from "@/contexts/page-context";

export default function ProfilePage() {
  usePageTitle("Профиль");

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Профиль</h2>
      <p className="text-muted-foreground">
        Активность пользователя, настройки и KYC.
      </p>
    </div>
  );
}
