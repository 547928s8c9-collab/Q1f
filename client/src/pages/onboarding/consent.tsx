import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { OnboardingLayout } from "@/components/onboarding/onboarding-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, FileText } from "lucide-react";

export default function OnboardingConsent() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const consentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/onboarding/accept-consent", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({
        title: "Consent accepted",
        description: "Thank you for accepting our terms",
      });
      setLocation("/onboarding/kyc");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit consent",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const canContinue = termsAccepted && privacyAccepted;

  const handleContinue = () => {
    if (!canContinue) return;
    consentMutation.mutate();
  };

  return (
    <OnboardingLayout currentStep={2} totalSteps={3}>
      <div className="flex-1 flex flex-col">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-2">Terms & Privacy</h1>
          <p className="text-muted-foreground text-sm">
            Please review and accept our terms to continue
          </p>
        </div>

        <Card className="p-5 mb-4">
          <h3 className="font-medium mb-3">Terms of Service</h3>
          <ScrollArea className="h-32 rounded border border-border p-3 mb-4">
            <div className="text-xs text-muted-foreground space-y-2">
              <p>
                By using ZEON, you agree to be bound by these Terms of Service. ZEON provides
                digital asset management and investment services subject to applicable laws and
                regulations.
              </p>
              <p>
                You acknowledge that cryptocurrency investments carry significant risk and you
                may lose some or all of your investment. Past performance is not indicative of
                future results.
              </p>
              <p>
                You agree to provide accurate information during registration and maintain the
                security of your account credentials. You are responsible for all activities
                that occur under your account.
              </p>
              <p>
                ZEON reserves the right to suspend or terminate accounts that violate these
                terms or engage in suspicious activity.
              </p>
            </div>
          </ScrollArea>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              data-testid="checkbox-terms"
            />
            <Label htmlFor="terms" className="text-sm cursor-pointer">
              I accept the Terms of Service
            </Label>
          </div>
        </Card>

        <Card className="p-5 mb-6">
          <h3 className="font-medium mb-3">Privacy Policy</h3>
          <ScrollArea className="h-32 rounded border border-border p-3 mb-4">
            <div className="text-xs text-muted-foreground space-y-2">
              <p>
                ZEON collects and processes personal data to provide our services, comply with
                legal obligations, and improve user experience.
              </p>
              <p>
                We collect information you provide directly, such as name, email, and identity
                documents for KYC purposes. We also collect usage data and transaction history.
              </p>
              <p>
                Your data is stored securely and shared only with service providers necessary
                to operate our platform and comply with legal requirements.
              </p>
              <p>
                You have rights to access, correct, and delete your personal data subject to
                applicable laws. Contact support for data-related requests.
              </p>
            </div>
          </ScrollArea>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="privacy"
              checked={privacyAccepted}
              onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
              data-testid="checkbox-privacy"
            />
            <Label htmlFor="privacy" className="text-sm cursor-pointer">
              I accept the Privacy Policy
            </Label>
          </div>
        </Card>

        <Button
          className="w-full"
          onClick={handleContinue}
          disabled={!canContinue || consentMutation.isPending}
          data-testid="button-accept-consent"
        >
          {consentMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
