import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { OnboardingLayout } from "@/components/onboarding/onboarding-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";

export default function OnboardingVerify() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  const sendCodeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/onboarding/send-code", {});
    },
    onSuccess: () => {
      setCodeSent(true);
      toast({
        title: "Code sent",
        description: "Check your email for the verification code",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send code",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (verificationCode: string) => {
      return apiRequest("POST", "/api/onboarding/verify-code", { code: verificationCode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({
        title: "Verified!",
        description: "Your contact has been verified",
      });
      setLocation("/onboarding/consent");
    },
    onError: (error: Error) => {
      toast({
        title: "Verification failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendCode = () => {
    sendCodeMutation.mutate();
  };

  const handleVerify = () => {
    if (code.length < 6) return;
    verifyMutation.mutate(code);
  };

  return (
    <OnboardingLayout currentStep={1} totalSteps={3}>
      <div className="flex-1 flex flex-col">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-2">Verify Your Contact</h1>
          <p className="text-muted-foreground text-sm">
            We'll send a verification code to your email
          </p>
        </div>

        <Card className="p-5 mb-6">
          {!codeSent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Click the button below to receive a verification code
              </p>
              <Button
                className="w-full"
                onClick={handleSendCode}
                disabled={sendCodeMutation.isPending}
                data-testid="button-send-code"
              >
                {sendCodeMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Verification Code"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-positive mb-4">
                <CheckCircle2 className="w-4 h-4" />
                Code sent to your email
              </div>
              <div>
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="mt-2 text-center text-2xl tracking-[0.5em] font-mono"
                  data-testid="input-verification-code"
                />
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Enter the 6-digit code sent to your email
                </p>
              </div>
              <Button
                className="w-full"
                onClick={handleVerify}
                disabled={code.length < 6 || verifyMutation.isPending}
                data-testid="button-verify-code"
              >
                {verifyMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </Button>
              <button
                onClick={handleSendCode}
                className="w-full text-sm text-primary hover:underline"
                disabled={sendCodeMutation.isPending}
              >
                Resend code
              </button>
            </div>
          )}
        </Card>
      </div>
    </OnboardingLayout>
  );
}
