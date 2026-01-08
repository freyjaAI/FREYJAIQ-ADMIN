import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, FileText, Shield, Scale } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";

interface LegalAcceptanceModalProps {
  userId: string;
}

export function LegalAcceptanceModal({ userId }: LegalAcceptanceModalProps) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedB2bUse, setAcceptedB2bUse] = useState(false);
  const [acceptedCompliance, setAcceptedCompliance] = useState(false);

  const { data: legalStatus, isLoading } = useQuery<{
    hasAccepted: boolean;
    needsUpdate: boolean;
    currentTermsVersion: string;
    currentPrivacyVersion: string;
  }>({
    queryKey: ["/api/legal/status"],
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/legal/accept", {
        method: "POST",
        body: JSON.stringify({
          acceptedTerms: true,
          acceptedPrivacy: true,
          acceptedB2bUseOnly: true,
          acceptedTcpaFcraCompliance: true,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/legal/status"] });
    },
  });

  const allAccepted = acceptedTerms && acceptedPrivacy && acceptedB2bUse && acceptedCompliance;
  const showModal = !isLoading && legalStatus && (!legalStatus.hasAccepted || legalStatus.needsUpdate);

  if (!showModal) return null;

  return (
    <Dialog open={true}>
      <DialogContent className="max-w-2xl max-h-[90vh]" data-testid="modal-legal-acceptance">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Scale className="w-6 h-6 text-primary" />
            Terms of Service Agreement
          </DialogTitle>
          <DialogDescription>
            Please review and accept our terms before using FreyjaIQ
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="space-y-6">
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-md">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-amber-600 dark:text-amber-400">Important Legal Notice</p>
                  <p className="text-sm mt-1">
                    FreyjaIQ provides data for <strong>B2B commercial real estate prospecting only</strong>. 
                    You must agree to the following terms to continue.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                <Checkbox
                  id="terms"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                  data-testid="checkbox-accept-terms"
                />
                <div className="flex-1">
                  <Label htmlFor="terms" className="font-medium cursor-pointer">
                    I have read and agree to the{" "}
                    <Link href="/terms" className="text-primary underline" target="_blank">
                      Terms of Service
                    </Link>
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Including data accuracy disclaimers, limitation of liability, and indemnification clauses.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                <Checkbox
                  id="privacy"
                  checked={acceptedPrivacy}
                  onCheckedChange={(checked) => setAcceptedPrivacy(checked === true)}
                  data-testid="checkbox-accept-privacy"
                />
                <div className="flex-1">
                  <Label htmlFor="privacy" className="font-medium cursor-pointer">
                    I have read and agree to the{" "}
                    <Link href="/privacy" className="text-primary underline" target="_blank">
                      Privacy Policy
                    </Link>
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Including how we collect, use, and share data from third-party providers.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                <Checkbox
                  id="b2b"
                  checked={acceptedB2bUse}
                  onCheckedChange={(checked) => setAcceptedB2bUse(checked === true)}
                  data-testid="checkbox-accept-b2b"
                />
                <div className="flex-1">
                  <Label htmlFor="b2b" className="font-medium cursor-pointer">
                    I understand this data is for B2B commercial use only
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    I will NOT use this data for consumer credit decisions, employment screening, 
                    tenant screening, insurance underwriting, or any purpose prohibited by FCRA.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <Checkbox
                  id="compliance"
                  checked={acceptedCompliance}
                  onCheckedChange={(checked) => setAcceptedCompliance(checked === true)}
                  data-testid="checkbox-accept-compliance"
                />
                <div className="flex-1">
                  <Label htmlFor="compliance" className="font-medium cursor-pointer">
                    I accept full liability for TCPA/FCRA compliance
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    I am solely responsible for complying with the Telephone Consumer Protection Act (TCPA). 
                    I will not use auto-dialers or robo-calling without consent. I will obtain prior 
                    express written consent before calling cell phones for marketing purposes.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-md">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium">Data Accuracy Disclaimer</p>
                  <p className="mt-1">
                    Data is sourced from third-party providers and public records. Information may be 
                    outdated or inaccurate. FreyjaIQ makes no warranties about data accuracy. 
                    You assume all risk for data inaccuracies and must verify information before use.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <p className="text-xs text-muted-foreground flex-1">
            By clicking "Accept & Continue", you agree to be bound by these terms.
          </p>
          <Button
            onClick={() => acceptMutation.mutate()}
            disabled={!allAccepted || acceptMutation.isPending}
            data-testid="button-accept-terms"
          >
            {acceptMutation.isPending ? "Processing..." : "Accept & Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
