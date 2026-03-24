import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { OnboardingLayout } from "@/components/onboarding/onboarding-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Loader2, 
  UserCheck, 
  Camera, 
  FileCheck, 
  Clock, 
  AlertCircle,
  XCircle,
  PauseCircle,
  RefreshCw
} from "lucide-react";
import type { KycStatusDTO } from "@shared/schema";

const KYC_STATUS_CONFIG = {
  NOT_STARTED: {
    title: "Верификация личности",
    description: "Пройдите KYC, чтобы разблокировать все функции",
    icon: UserCheck,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
    showIntro: true,
  },
  IN_REVIEW: {
    title: "Верификация в процессе",
    description: "Мы проверяем ваши документы. Обычно это занимает несколько минут.",
    icon: Clock,
    iconColor: "text-warning",
    iconBg: "bg-warning/10",
    showIntro: false,
  },
  APPROVED: {
    title: "Личность подтверждена",
    description: "Ваша личность успешно верифицирована.",
    icon: UserCheck,
    iconColor: "text-positive",
    iconBg: "bg-positive/10",
    showIntro: false,
  },
  NEEDS_ACTION: {
    title: "Требуется действие",
    description: "Нам нужна дополнительная информация для завершения верификации.",
    icon: AlertCircle,
    iconColor: "text-warning",
    iconBg: "bg-warning/10",
    showIntro: false,
  },
  REJECTED: {
    title: "Верификация отклонена",
    description: "К сожалению, мы не смогли подтвердить вашу личность.",
    icon: XCircle,
    iconColor: "text-destructive",
    iconBg: "bg-destructive/10",
    showIntro: false,
  },
  ON_HOLD: {
    title: "Верификация приостановлена",
    description: "Ваша верификация приостановлена до ручной проверки.",
    icon: PauseCircle,
    iconColor: "text-muted-foreground",
    iconBg: "bg-muted",
    showIntro: false,
  },
};

export default function OnboardingKyc() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: kycStatus, isLoading } = useQuery<KycStatusDTO>({
    queryKey: ["/api/kyc/status"],
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "IN_REVIEW") {
        return 1000;
      }
      return false;
    },
  });

  const startKycMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/kyc/start", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kyc/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({
        title: "Верификация запущена",
        description: "Пожалуйста, подождите, пока мы проверяем вашу личность",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Не удалось начать верификацию",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const status = kycStatus?.status || "NOT_STARTED";
  const config = KYC_STATUS_CONFIG[status as keyof typeof KYC_STATUS_CONFIG] || KYC_STATUS_CONFIG.NOT_STARTED;
  const IconComponent = config.icon;

  useEffect(() => {
    if (status === "APPROVED") {
      const timeout = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
        setLocation("/onboarding/smart-start");
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [status, setLocation]);

  const handleStartKyc = () => {
    startKycMutation.mutate();
  };

  const canStartKyc = kycStatus?.allowedTransitions?.includes("IN_REVIEW");

  if (isLoading) {
    return (
      <OnboardingLayout currentStep={3} totalSteps={3}>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout currentStep={3} totalSteps={3}>
      <div className="flex-1 flex flex-col">
        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-full ${config.iconBg} flex items-center justify-center mx-auto mb-4`}>
            <IconComponent className={`w-8 h-8 ${config.iconColor}`} />
          </div>
          <h1 className="text-xl font-bold mb-2" data-testid="text-kyc-title">{config.title}</h1>
          <p className="text-muted-foreground text-sm" data-testid="text-kyc-description">
            {config.description}
          </p>
        </div>

        {status === "NOT_STARTED" && (
          <>
            <div className="space-y-4 mb-6">
              <Card className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <FileCheck className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">Удостоверение личности</h3>
                  <p className="text-sm text-muted-foreground">
                    Паспорт, водительское удостоверение или ID-карта
                  </p>
                </div>
              </Card>

              <Card className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">Селфи-верификация</h3>
                  <p className="text-sm text-muted-foreground">
                    Сделайте фото для сверки с документом
                  </p>
                </div>
              </Card>

              <Card className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">Быстрый процесс</h3>
                  <p className="text-sm text-muted-foreground">
                    Обычно верификация занимает несколько минут
                  </p>
                </div>
              </Card>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 mb-6">
              <p className="text-xs text-muted-foreground text-center">
                Нажмите «Начать», чтобы запустить процесс верификации
              </p>
            </div>

            <Button
              className="w-full"
              onClick={handleStartKyc}
              disabled={startKycMutation.isPending || !canStartKyc}
              data-testid="button-start-kyc"
            >
              {startKycMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Запуск...
                </>
              ) : (
                "Начать верификацию"
              )}
            </Button>
          </>
        )}

        {status === "IN_REVIEW" && (
          <Card className="p-8 flex flex-col items-center">
            <Loader2 className="w-12 h-12 animate-spin text-warning mb-4" />
            <h3 className="font-medium mb-2">Обработка...</h3>
            <p className="text-sm text-muted-foreground text-center">
              Пожалуйста, подождите, пока мы проверяем вашу личность
            </p>
            {kycStatus?.submittedAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Начало: {new Date(kycStatus.submittedAt).toLocaleTimeString("ru-RU")}
              </p>
            )}
          </Card>
        )}

        {status === "APPROVED" && (
          <Card className="p-8 flex flex-col items-center bg-positive/5 border-positive/20">
            <div className="w-16 h-16 rounded-full bg-positive/20 flex items-center justify-center mb-4">
              <UserCheck className="w-8 h-8 text-positive" />
            </div>
            <h3 className="font-medium mb-2 text-positive">Подтверждено!</h3>
            <p className="text-sm text-muted-foreground text-center">
              Перенаправление для завершения настройки...
            </p>
          </Card>
        )}

        {status === "NEEDS_ACTION" && (
          <Card className="p-6">
            <div className="flex items-start gap-4 mb-4">
              <AlertCircle className="w-6 h-6 text-warning flex-shrink-0" />
              <div>
                <h3 className="font-medium mb-1">Требуется дополнительная информация</h3>
                <p className="text-sm text-muted-foreground">
                  {kycStatus?.needsActionReason || "Пожалуйста, предоставьте дополнительные документы для завершения верификации."}
                </p>
              </div>
            </div>
            {canStartKyc && (
              <Button
                className="w-full"
                onClick={handleStartKyc}
                disabled={startKycMutation.isPending}
                data-testid="button-resubmit-kyc"
              >
                {startKycMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Повторная отправка...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Отправить документы повторно
                  </>
                )}
              </Button>
            )}
          </Card>
        )}

        {status === "REJECTED" && (
          <Card className="p-6 bg-destructive/5 border-destructive/20">
            <div className="flex items-start gap-4">
              <XCircle className="w-6 h-6 text-destructive flex-shrink-0" />
              <div>
                <h3 className="font-medium mb-1 text-destructive">Верификация отклонена</h3>
                <p className="text-sm text-muted-foreground">
                  {kycStatus?.rejectionReason || "Вашу верификацию не удалось завершить. Пожалуйста, обратитесь в службу поддержки."}
                </p>
              </div>
            </div>
          </Card>
        )}

        {status === "ON_HOLD" && (
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <PauseCircle className="w-6 h-6 text-muted-foreground flex-shrink-0" />
              <div>
                <h3 className="font-medium mb-1">Требуется ручная проверка</h3>
                <p className="text-sm text-muted-foreground">
                  Ваша верификация требует ручной проверки нашей командой комплаенса. Это может занять 1–2 рабочих дня.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </OnboardingLayout>
  );
}
