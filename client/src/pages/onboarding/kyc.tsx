import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { OnboardingLayout } from "@/components/onboarding/onboarding-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, UserCheck, Camera, FileCheck, Clock } from "lucide-react";

type KycStep = "intro" | "processing" | "done";

export default function OnboardingKyc() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<KycStep>("intro");

  const startKycMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/onboarding/start-kyc", {});
    },
    onSuccess: () => {
      setStep("processing");
      setTimeout(() => {
        completeKycMutation.mutate();
      }, 2000);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start verification",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const completeKycMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/onboarding/complete-kyc", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      setStep("done");
      toast({
        title: "Verification complete!",
        description: "Your identity has been verified",
      });
      setTimeout(() => {
        setLocation("/onboarding/done");
      }, 1500);
    },
    onError: (error: Error) => {
      toast({
        title: "Verification failed",
        description: error.message,
        variant: "destructive",
      });
      setStep("intro");
    },
  });

  const handleStartKyc = () => {
    startKycMutation.mutate();
  };

  return (
    <OnboardingLayout currentStep={3} totalSteps={3}>
      <div className="flex-1 flex flex-col">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <UserCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-2">Identity Verification</h1>
          <p className="text-muted-foreground text-sm">
            {step === "intro" && "Complete KYC to unlock all features"}
            {step === "processing" && "Verifying your identity..."}
            {step === "done" && "Verification successful!"}
          </p>
        </div>

        {step === "intro" && (
          <>
            <div className="space-y-4 mb-6">
              <Card className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <FileCheck className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">Government ID</h3>
                  <p className="text-sm text-muted-foreground">
                    Passport, driver's license, or national ID
                  </p>
                </div>
              </Card>

              <Card className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">Selfie Verification</h3>
                  <p className="text-sm text-muted-foreground">
                    Take a photo to match with your ID
                  </p>
                </div>
              </Card>

              <Card className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">Quick Process</h3>
                  <p className="text-sm text-muted-foreground">
                    Usually verified within minutes
                  </p>
                </div>
              </Card>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 mb-6">
              <p className="text-xs text-muted-foreground text-center">
                Demo mode: Click start to simulate the verification process
              </p>
            </div>

            <Button
              className="w-full"
              onClick={handleStartKyc}
              disabled={startKycMutation.isPending}
              data-testid="button-start-kyc"
            >
              {startKycMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                "Start Verification"
              )}
            </Button>
          </>
        )}

        {step === "processing" && (
          <Card className="p-8 flex flex-col items-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <h3 className="font-medium mb-2">Processing...</h3>
            <p className="text-sm text-muted-foreground text-center">
              Please wait while we verify your identity
            </p>
          </Card>
        )}

        {step === "done" && (
          <Card className="p-8 flex flex-col items-center bg-positive/5 border-positive/20">
            <div className="w-16 h-16 rounded-full bg-positive/20 flex items-center justify-center mb-4">
              <UserCheck className="w-8 h-8 text-positive" />
            </div>
            <h3 className="font-medium mb-2 text-positive">Verified!</h3>
            <p className="text-sm text-muted-foreground text-center">
              Redirecting to complete setup...
            </p>
          </Card>
        )}
      </div>
    </OnboardingLayout>
  );
}
