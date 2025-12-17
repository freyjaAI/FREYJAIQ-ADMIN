import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cookie, X } from "lucide-react";
import { Link } from "wouter";

const COOKIE_CONSENT_KEY = "freyjaiq_cookie_consent";

type ConsentState = "accepted" | "declined" | "pending";

export function CookieConsent() {
  const [consentState, setConsentState] = useState<ConsentState>("pending");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (stored === "accepted" || stored === "declined") {
      setConsentState(stored);
      setIsVisible(false);
    } else {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    setConsentState("accepted");
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "declined");
    setConsentState("declined");
    setIsVisible(false);
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
      data-testid="cookie-consent-banner"
    >
      <Card className="mx-auto max-w-4xl p-4 md:p-6 shadow-lg border-border/50 bg-card/95 backdrop-blur-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <div className="flex items-start gap-3 flex-1">
            <div className="rounded-md bg-muted p-2">
              <Cookie className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">Cookie Notice</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We use essential cookies to enable core functionality like authentication and session management. 
                We also use analytics cookies to understand how you use our platform and improve your experience. 
                By continuing to use FreyjaIQ, you consent to our use of cookies.{" "}
                <Link href="/privacy" className="text-primary hover:underline">
                  Learn more
                </Link>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDecline}
              data-testid="button-decline-cookies"
            >
              Decline Optional
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleAccept}
              data-testid="button-accept-cookies"
            >
              Accept All
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              className="ml-1"
              data-testid="button-dismiss-cookies"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Dismiss</span>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function useCookieConsent() {
  const [consent, setConsent] = useState<ConsentState>("pending");

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (stored === "accepted" || stored === "declined") {
      setConsent(stored);
    }
  }, []);

  return {
    hasConsent: consent === "accepted",
    consentState: consent,
    canUseAnalytics: consent === "accepted",
  };
}
