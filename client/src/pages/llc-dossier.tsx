import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Building,
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Users,
  FileText,
  Loader2,
  RefreshCw,
  Calendar,
  Briefcase,
  CheckCircle,
  User,
  Home,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ClickableEntity } from "@/components/clickable-entity";
import type { Llc } from "@shared/schema";

interface EnrichedOfficer {
  name: string;
  position: string;
  role?: string;
  address?: string;
  phones: Array<{ 
    phone: string; 
    type: string; 
    source?: string;
    confidence?: number;
    provider?: string;
    verified?: boolean;
  }>;
  emails: Array<{ 
    email: string; 
    type?: string;
    source?: string;
    confidence?: number;
  }>;
  confidenceScore: number;
  skipTraceData?: {
    firstName?: string;
    lastName?: string;
    age?: number;
    born?: string;
    currentAddress?: {
      streetAddress?: string;
      city?: string;
      state?: string;
      postalCode?: string;
    };
    previousAddresses?: Array<any>;
    relatives?: Array<{ name: string; type?: string }>;
    associates?: Array<{ name: string }>;
    personLink?: string;
  };
  melissaData?: {
    nameMatch?: { verified: boolean; confidence?: number };
    addressMatch?: { verified: boolean; confidence?: number };
  };
}

interface RawOfficer {
  name: string;
  position?: string;
  role?: string;
  address?: string;
}

interface LlcDossierResponse {
  llc: Llc & {
    officers: RawOfficer[];
    enrichmentData?: any;
    aiOutreach?: string | null;
  };
  officers: EnrichedOfficer[];
  rawOfficers?: RawOfficer[]; // Original officers from OpenCorporates
  enrichment?: any;
  aiOutreach?: string | null;
}

// Helper to format address from string or JSON object
function formatAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  
  // If it's a plain string, return it
  if (!address.includes("{") && !address.includes('"')) {
    return address;
  }
  
  // Try to parse as JSON
  try {
    const parsed = JSON.parse(address);
    if (typeof parsed === "object" && parsed !== null) {
      const parts = [
        parsed.street_address || parsed.streetAddress || parsed.street,
        parsed.locality || parsed.city,
        parsed.region || parsed.state,
        parsed.postal_code || parsed.postalCode || parsed.zip,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : null;
    }
  } catch {
    // Not valid JSON, return as-is
    return address;
  }
  
  return address;
}

export default function LlcDossierPage() {
  const [, params] = useRoute("/llcs/:id");
  const id = params?.id;
  const { toast } = useToast();

  const { data: dossierResponse, isLoading, error, refetch } = useQuery<LlcDossierResponse>({
    queryKey: ["/api/llcs", id, "dossier"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/llcs/${id}/dossier`);
      return res.json();
    },
    enabled: !!id,
  });
  
  const dossier = dossierResponse?.llc;
  const enrichedOfficers = dossierResponse?.officers || [];
  const rawOfficers = dossierResponse?.rawOfficers || dossier?.officers || [];
  
  // Find raw officers that weren't enriched (by comparing names)
  // Use defensive guards for undefined names
  const enrichedNames = new Set(
    enrichedOfficers
      .map(o => (o.name || "").toLowerCase().trim())
      .filter(name => name.length > 0)
  );
  const nonEnrichedOfficers = rawOfficers.filter(o => {
    const name = (o.name || "").toLowerCase().trim();
    return name.length > 0 && !enrichedNames.has(name);
  });

  const enrichMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", `/api/llcs/${id}/dossier`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/llcs", id, "dossier"] });
      toast({
        title: "Dossier updated",
        description: "Officer contact information has been enriched.",
      });
    },
    onError: () => {
      toast({
        title: "Enrichment failed",
        description: "Could not enrich officer contacts. Please try again.",
        variant: "destructive",
      });
    },
  });

  const runFullEnrichmentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/llcs/${id}/enrich`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/llcs", id, "dossier"] });
      toast({
        title: "Full Enrichment Complete",
        description: "All available data sources have been queried for officer information.",
      });
    },
    onError: () => {
      toast({
        title: "Enrichment failed",
        description: "Could not complete full enrichment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string | null | undefined) => {
    if (!status) return "secondary";
    const s = status.toLowerCase();
    if (s.includes("active") || s.includes("good")) return "default";
    if (s.includes("inactive") || s.includes("dissolved")) return "destructive";
    return "secondary";
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
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !dossierResponse || !dossier) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/llcs">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to LLCs
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center">
              <Building className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">LLC not found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                The requested LLC could not be found.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/llcs" data-testid="button-back-llcs">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold" data-testid="text-llc-name">
                {dossier.name}
              </h1>
              {dossier.status && (
                <Badge variant={getStatusColor(dossier.status)}>
                  {dossier.status}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              {dossier.jurisdiction && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {dossier.jurisdiction.toUpperCase()}
                </span>
              )}
              {dossier.entityType && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {dossier.entityType}
                </span>
              )}
              {dossier.registrationNumber && (
                <span className="font-mono">{dossier.registrationNumber}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            onClick={() => runFullEnrichmentMutation.mutate()}
            disabled={runFullEnrichmentMutation.isPending}
            data-testid="button-run-full-enrichment"
          >
            {runFullEnrichmentMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Run Full Enrichment
          </Button>
          <Button
            variant="outline"
            onClick={() => enrichMutation.mutate()}
            disabled={enrichMutation.isPending}
            data-testid="button-refresh-dossier"
          >
            {enrichMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="h-4 w-4" />
              Company Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {formatAddress(dossier.registeredAddress) && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Registered Address</p>
                <p className="text-sm">{formatAddress(dossier.registeredAddress)}</p>
              </div>
            )}
            {formatAddress(dossier.principalAddress) && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Principal Address</p>
                <p className="text-sm">{formatAddress(dossier.principalAddress)}</p>
              </div>
            )}
            {dossier.formationDate && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Formation Date</p>
                <p className="text-sm flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(dossier.formationDate).toLocaleDateString()}
                </p>
              </div>
            )}
            {dossier.registeredAgent && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Registered Agent</p>
                <p className="text-sm">{dossier.registeredAgent}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Officers & Directors
              {enrichedOfficers.length > 0 && (
                <Badge variant="secondary">
                  {enrichedOfficers.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {enrichedOfficers.length > 0 ? (
              <div className="space-y-4">
                {enrichedOfficers.map((officer, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          <ClickableEntity 
                            name={officer.name} 
                            type="individual" 
                            showIcon={false}
                            size="md"
                          />
                          {officer.melissaData?.nameMatch?.verified && (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{officer.position}</p>
                      </div>
                      <Badge variant="outline">
                        {officer.confidenceScore ?? 30}% confidence
                      </Badge>
                    </div>
                    
                    {officer.skipTraceData?.currentAddress && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Home className="h-3 w-3" />
                        <span>
                          {[
                            officer.skipTraceData.currentAddress.streetAddress,
                            officer.skipTraceData.currentAddress.city,
                            officer.skipTraceData.currentAddress.state,
                            officer.skipTraceData.currentAddress.postalCode,
                          ].filter(Boolean).join(", ")}
                        </span>
                        {officer.melissaData?.addressMatch?.verified && (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        )}
                      </div>
                    )}
                    
                    {((officer.phones?.length || 0) > 0 || (officer.emails?.length || 0) > 0) && (
                      <div className="flex flex-col gap-1 pl-4 border-l-2 border-muted">
                        {(officer.phones || []).map((phone, pIdx) => (
                          <a
                            key={pIdx}
                            href={`tel:${phone.phone}`}
                            className="text-sm flex items-center gap-2 text-muted-foreground hover:text-foreground"
                          >
                            <Phone className="h-3 w-3" />
                            {phone.phone}
                            <Badge variant="outline">
                              {phone.type}
                            </Badge>
                            {phone.verified && (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            )}
                          </a>
                        ))}
                        {(officer.emails || []).map((email, eIdx) => (
                          <a
                            key={eIdx}
                            href={`mailto:${email.email}`}
                            className="text-sm flex items-center gap-2 text-muted-foreground hover:text-foreground"
                          >
                            <Mail className="h-3 w-3" />
                            {email.email}
                          </a>
                        ))}
                      </div>
                    )}
                    
                    {officer.skipTraceData?.relatives && officer.skipTraceData.relatives.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Relatives: </span>
                        {officer.skipTraceData.relatives.slice(0, 3).map(r => r.name).join(", ")}
                        {officer.skipTraceData.relatives.length > 3 && ` +${officer.skipTraceData.relatives.length - 3} more`}
                      </div>
                    )}
                    {idx < enrichedOfficers.length - 1 && <Separator />}
                  </div>
                ))}
                {/* Show non-enriched officers */}
                {nonEnrichedOfficers.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <p className="text-sm text-muted-foreground font-medium">Other Officers (not enriched)</p>
                    {nonEnrichedOfficers.map((officer, idx) => (
                      <div key={`raw-${idx}`} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <ClickableEntity 
                          name={officer.name} 
                          type="individual"
                          size="sm"
                        />
                        {officer.position && (
                          <span className="opacity-60">- {officer.position}</span>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : nonEnrichedOfficers.length > 0 ? (
              <div className="space-y-2">
                {nonEnrichedOfficers.map((officer, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ClickableEntity 
                      name={officer.name} 
                      type="individual"
                      size="sm"
                    />
                    {officer.position && (
                      <span className="opacity-60">- {officer.position}</span>
                    )}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-2">Click "Run Full Enrichment" to enrich officer contact information</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No officer information available.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {dossier.aiOutreach && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              AI Outreach Suggestion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{dossier.aiOutreach}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
