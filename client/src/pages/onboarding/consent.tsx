import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { OnboardingLayout } from "@/components/onboarding/onboarding-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, FileText, Shield, Scale, ExternalLink } from "lucide-react";
import type { BootstrapResponse } from "@shared/schema";

export default function OnboardingConsent() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const { data: bootstrap } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const consentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/consent/accept", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consent/status"] });
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

  const consentVersion = bootstrap?.consent?.requiredVersion || "1.0";

  return (
    <OnboardingLayout currentStep={2} totalSteps={3}>
      <div className="flex-1 flex flex-col">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-2" data-testid="text-consent-title">Terms & Privacy</h1>
          <p className="text-muted-foreground text-sm">
            Please review and accept our legal agreements
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Version {consentVersion}
          </p>
        </div>

        <Card className="p-5 mb-4">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <Scale className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium mb-1">Terms of Service</h3>
              <p className="text-sm text-muted-foreground mb-3">
                By continuing, you agree to our terms including investment risks, account responsibilities, and platform usage guidelines.
              </p>
              <a
                href="#terms"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                data-testid="link-terms-full"
              >
                Read full Terms of Service
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <div className="flex items-center space-x-2 pt-3 border-t border-border">
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              data-testid="checkbox-terms"
            />
            <Label htmlFor="terms" className="text-sm cursor-pointer">
              I have read and accept the Terms of Service
            </Label>
          </div>
        </Card>

        <Card className="p-5 mb-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium mb-1">Privacy Policy</h3>
              <p className="text-sm text-muted-foreground mb-3">
                We collect and process your data securely to provide our services. You have rights to access, correct, and delete your data.
              </p>
              <a
                href="#privacy"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                data-testid="link-privacy-full"
              >
                Read full Privacy Policy
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <div className="flex items-center space-x-2 pt-3 border-t border-border">
            <Checkbox
              id="privacy"
              checked={privacyAccepted}
              onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
              data-testid="checkbox-privacy"
            />
            <Label htmlFor="privacy" className="text-sm cursor-pointer">
              I have read and accept the Privacy Policy
            </Label>
          </div>
        </Card>

        <div className="bg-muted/50 rounded-lg p-4 mb-4">
          <p className="text-xs text-muted-foreground text-center">
            By clicking Accept, you consent to our Terms of Service and Privacy Policy. 
            Your acceptance will be recorded with a timestamp and document version for compliance.
          </p>
        </div>

        <Button
          className="w-full"
          onClick={handleContinue}
          disabled={!canContinue || consentMutation.isPending}
          data-testid="button-accept-consent"
        >
          {consentMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Recording consent...
            </>
          ) : (
            "Accept and Continue"
          )}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
