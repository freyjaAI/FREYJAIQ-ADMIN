import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Mail,
  Phone,
  Building2,
  Sparkles,
  RefreshCw,
  Copy,
  CheckCircle,
} from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { ScoreBadge, ProgressScore } from "@/components/score-badge";
import { EntityTypeBadge, RiskBadge } from "@/components/risk-badge";
import { PropertyCard } from "@/components/property-card";
import { ContactCard } from "@/components/contact-card";
import { LegalEventsTimeline } from "@/components/legal-events-timeline";
import { LlcNetwork } from "@/components/llc-network";
import type { Owner, Property, ContactInfo, LegalEvent, OwnerLlcLink } from "@shared/schema";

interface DossierData {
  owner: Owner;
  properties: Property[];
  contacts: ContactInfo[];
  legalEvents: LegalEvent[];
  linkedLlcs: (OwnerLlcLink & { llc?: Owner })[];
  aiOutreach?: string;
  scoreBreakdown?: {
    yearsOwned: number;
    taxDelinquent: boolean;
    absenteeOwner: boolean;
    hasLiens: boolean;
    marketAppreciation: number;
  };
}

export default function OwnerDossierPage() {
  const [, params] = useRoute("/owners/:id");
  const ownerId = params?.id;
  const { toast } = useToast();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const { data: dossier, isLoading } = useQuery<DossierData>({
    queryKey: ["/api/owners", ownerId, "dossier"],
    enabled: !!ownerId,
  });

  const generateDossierMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/owners/${ownerId}/generate-dossier`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owners", ownerId] });
      toast({ title: "Dossier generated successfully" });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to generate dossier",
        variant: "destructive",
      });
    },
  });

  const exportPdfMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/owners/${ownerId}/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to export PDF");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dossier-${dossier?.owner.name || ownerId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({ title: "PDF exported successfully" });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to export PDF",
        variant: "destructive",
      });
    },
  });

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!dossier) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-xl font-semibold">Owner not found</h2>
        <p className="text-muted-foreground mt-2">
          The owner you're looking for doesn't exist or has been removed.
        </p>
        <Button asChild className="mt-4">
          <Link href="/owners">Back to Owners</Link>
        </Button>
      </div>
    );
  }

  const { owner, properties, contacts, legalEvents, linkedLlcs, aiOutreach, scoreBreakdown } =
    dossier;

  const totalPropertyValue = properties.reduce(
    (sum, p) => sum + (p.assessedValue ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild data-testid="button-back">
            <Link href="/owners">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-semibold">{owner.name}</h1>
              <EntityTypeBadge type={owner.type} />
              {owner.riskFlags?.map((flag) => (
                <RiskBadge key={flag} type={flag} />
              ))}
            </div>
            {owner.primaryAddress && (
              <p className="text-muted-foreground mt-1">{owner.primaryAddress}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => generateDossierMutation.mutate()}
            disabled={generateDossierMutation.isPending}
            data-testid="button-refresh-dossier"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${
                generateDossierMutation.isPending ? "animate-spin" : ""
              }`}
            />
            Refresh Data
          </Button>
          <Button
            onClick={() => exportPdfMutation.mutate()}
            disabled={exportPdfMutation.isPending}
            data-testid="button-export-pdf"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="py-4">
                <div className="text-sm text-muted-foreground">Properties</div>
                <div className="text-2xl font-semibold mt-1">
                  {properties.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="text-sm text-muted-foreground">Total Value</div>
                <div className="text-2xl font-semibold mt-1">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(totalPropertyValue)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="text-sm text-muted-foreground">
                  LLC Connections
                </div>
                <div className="text-2xl font-semibold mt-1">
                  {linkedLlcs.length}
                </div>
              </CardContent>
            </Card>
          </div>

          {properties.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Properties Owned
                  <Badge variant="secondary" className="text-xs">
                    {properties.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {properties.map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    compact
                    showOwnerLink={false}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          <LlcNetwork owner={owner} linkedLlcs={linkedLlcs} />

          <LegalEventsTimeline events={legalEvents} />
        </div>

        <div className="space-y-6">
          {owner.sellerIntentScore !== null &&
            owner.sellerIntentScore !== undefined && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Seller Intent Score</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-center">
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-primary">
                      <span className="text-3xl font-bold">
                        {owner.sellerIntentScore}
                      </span>
                    </div>
                  </div>
                  {scoreBreakdown && (
                    <div className="space-y-2 pt-2">
                      <ProgressScore
                        score={Math.min(100, scoreBreakdown.yearsOwned * 10)}
                        label={`Years Owned: ${scoreBreakdown.yearsOwned}`}
                      />
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Tax Delinquent</span>
                        <Badge
                          variant={
                            scoreBreakdown.taxDelinquent
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {scoreBreakdown.taxDelinquent ? "Yes" : "No"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Absentee Owner</span>
                        <Badge
                          variant={
                            scoreBreakdown.absenteeOwner ? "default" : "secondary"
                          }
                        >
                          {scoreBreakdown.absenteeOwner ? "Yes" : "No"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Has Liens</span>
                        <Badge
                          variant={
                            scoreBreakdown.hasLiens ? "destructive" : "secondary"
                          }
                        >
                          {scoreBreakdown.hasLiens ? "Yes" : "No"}
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          <ContactCard contacts={contacts} />

          {aiOutreach && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Outreach Suggestion
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {aiOutreach}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-0 right-0"
                    onClick={() => handleCopy(aiOutreach)}
                    data-testid="button-copy-outreach"
                  >
                    {copiedText === aiOutreach ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {contacts.find((c) => c.kind === "phone") && (
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a
                    href={`tel:${contacts.find((c) => c.kind === "phone")?.value}`}
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    Call Primary Phone
                  </a>
                </Button>
              )}
              {contacts.find((c) => c.kind === "email") && (
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a
                    href={`mailto:${contacts.find((c) => c.kind === "email")?.value}`}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Send Email
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
