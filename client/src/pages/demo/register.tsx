import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { DemoLayout } from "./demo-layout";
import { useDemo } from "./demo-context";

type Step = "form" | "otp" | "verified";

const DEMO_OTP = "1234";

export default function DemoRegister() {
  const [, navigate] = useLocation();
  const { state, setPhone, setEmail, setOtpVerified } = useDemo();
  const [step, setStep] = useState<Step>("form");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState(false);

  const canSubmitForm = state.phone.length >= 10 && state.email.includes("@");

  const handleFormSubmit = () => {
    if (canSubmitForm) setStep("otp");
  };

  const handleOtpComplete = (value: string) => {
    setOtp(value);
    if (value === DEMO_OTP) {
      setOtpError(false);
      setOtpVerified(true);
      setStep("verified");
    } else if (value.length === 4) {
      setOtpError(true);
    }
  };

  return (
    <DemoLayout>
      <div className="flex-1 flex flex-col justify-center gap-6">
        {step === "form" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Регистрация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Телефон</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+7 (999) 123-45-67"
                  value={state.phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={state.email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button className="w-full" size="lg" disabled={!canSubmitForm} onClick={handleFormSubmit}>
                Получить код
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "otp" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Введите код</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Демо-код: <span className="font-mono font-semibold text-foreground">1234</span>
              </p>
              <div className="flex justify-center">
                <InputOTP maxLength={4} value={otp} onChange={handleOtpComplete}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {otpError && (
                <p className="text-sm text-destructive text-center">Неверный код. Попробуйте 1234</p>
              )}
            </CardContent>
          </Card>
        )}

        {step === "verified" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 animate-in zoom-in-50 duration-300" />
            <h2 className="text-xl font-semibold">Аккаунт создан!</h2>
            <p className="text-sm text-muted-foreground">
              {state.phone} &middot; {state.email}
            </p>
            <Button size="lg" onClick={() => navigate("/demo/questionnaire")}>
              Продолжить
            </Button>
          </div>
        )}
      </div>
    </DemoLayout>
  );
}
