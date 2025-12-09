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
  Users,
  FileText,
  MapPin,
  Calendar,
  Shield,
  AtSign,
  PhoneCall,
  User,
  Home,
  Truck,
  AlertCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { ScoreBadge, ProgressScore } from "@/components/score-badge";
import { EntityTypeBadge, RiskBadge } from "@/components/risk-badge";
import { PropertyCard } from "@/components/property-card";
import { LegalEventsTimeline } from "@/components/legal-events-timeline";
import { LlcNetwork } from "@/components/llc-network";
import type { Owner, Property, ContactInfo, LegalEvent, OwnerLlcLink } from "@shared/schema";

interface LlcUnmaskingData {
  companyNumber: string;
  name: string;
  jurisdictionCode: string;
  incorporationDate: string | null;
  companyType: string | null;
  currentStatus: string;
  registeredAddress: string | null;
  officers: Array<{
    name: string;
    position: string;
    startDate?: string;
    role: "officer" | "agent" | "member" | "manager";
    confidenceScore: number;
  }>;
  registeredAgent: {
    name: string;
    address?: string;
  } | null;
  filings: Array<{
    title: string;
    date: string;
    url?: string;
  }>;
  lastUpdated: string;
}

interface ContactEnrichmentData {
  companyEmails: Array<{
    email: string;
    type: "general" | "personal" | "department";
    confidence: number;
  }>;
  directDials: Array<{
    phone: string;
    type: "mobile" | "direct" | "office";
    name?: string;
    title?: string;
    confidence: number;
  }>;
  employeeProfiles: Array<{
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    confidence: number;
  }>;
  sources: string[];
  lastUpdated: string;
}

interface MelissaEnrichmentData {
  nameMatch: {
    verified: boolean;
    standardizedName: {
      first: string;
      last: string;
      full: string;
    };
    confidence: number;
  } | null;
  addressMatch: {
    verified: boolean;
    standardizedAddress: {
      line1: string;
      city: string;
      state: string;
      zip: string;
      plus4: string;
      county: string;
    };
    deliverability: string;
    residenceType: string;
    confidence: number;
  } | null;
  phoneMatches: Array<{
    phone: string;
    type: "mobile" | "landline" | "voip";
    lineType: string;
    carrier?: string;
    verified: boolean;
    confidence: number;
  }>;
  occupancy: {
    currentOccupant: boolean;
    lengthOfResidence?: number;
    moveDate?: string;
    ownerOccupied: boolean;
  } | null;
  moveHistory: Array<{
    address: string;
    moveInDate?: string;
    moveOutDate?: string;
    type: "previous" | "current";
  }>;
  demographics: {
    ageRange?: string;
    gender?: string;
    homeownerStatus?: string;
  } | null;
  lastUpdated: string;
}

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
  llcUnmasking?: LlcUnmaskingData | null;
  contactEnrichment?: ContactEnrichmentData | null;
  melissaEnrichment?: MelissaEnrichmentData | null;
}

const loadingSteps = [
  { id: "owner", label: "Loading owner profile" },
  { id: "properties", label: "Fetching property records" },
  { id: "llc", label: "Resolving LLC ownership" },
  { id: "contacts", label: "Enriching contact data" },
  { id: "ai", label: "Generating AI insights" },
];

function DossierLoadingProgress() {
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Cycle through steps continuously
  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % loadingSteps.length);
    }, 3000);

    const secondsInterval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(stepInterval);
      clearInterval(secondsInterval);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <Card className="w-full max-w-md" data-testid="card-loading-progress">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              Building Owner Dossier
            </CardTitle>
            <Badge variant="secondary" className="font-mono text-xs">
              {formatTime(elapsedSeconds)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSteps.map((step, idx) => {
            const isCurrent = idx === currentStep;

            return (
              <div key={step.id} className="flex items-center gap-3" data-testid={`loading-step-${step.id}`}>
                <div className="shrink-0">
                  {isCurrent ? (
                    <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                  )}
                </div>
                <div className={`text-sm ${isCurrent ? "font-medium" : "text-muted-foreground"}`}>
                  {step.label}
                  {isCurrent && <span className="animate-pulse">...</span>}
                </div>
              </div>
            );
          })}
          <Separator className="my-2" />
          <div className="text-xs text-muted-foreground text-center space-y-1">
            <div>Querying OpenCorporates, Data Axle, A-Leads & Melissa</div>
            <div className="text-muted-foreground/70">
              This may take 1-2 minutes for comprehensive data
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
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
    return <DossierLoadingProgress />;
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

  const { owner, properties, contacts, legalEvents, linkedLlcs, aiOutreach, scoreBreakdown, llcUnmasking, contactEnrichment, melissaEnrichment } =
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

          {owner.type === "entity" && (
            <Card data-testid="card-llc-unmasking">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Business / LLC Owner Info
                  {llcUnmasking && llcUnmasking.officers && (
                    <Badge variant="secondary" className="text-xs">
                      {llcUnmasking.officers.length} people
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {llcUnmasking ? (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{llcUnmasking.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {llcUnmasking.jurisdictionCode?.toUpperCase().replace("US_", "")} - {llcUnmasking.companyType || "LLC"}
                          </div>
                        </div>
                        <Badge variant={llcUnmasking.currentStatus?.toLowerCase() === "active" ? "default" : "secondary"}>
                          {llcUnmasking.currentStatus || "Unknown"}
                        </Badge>
                      </div>

                      {llcUnmasking.incorporationDate && (
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Incorporated:</span>
                          <span>{new Date(llcUnmasking.incorporationDate).toLocaleDateString()}</span>
                        </div>
                      )}

                      {llcUnmasking.registeredAddress && (
                        <div className="flex items-start gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <span className="text-muted-foreground">Registered Address: </span>
                            <span>{typeof llcUnmasking.registeredAddress === 'string' 
                              ? llcUnmasking.registeredAddress 
                              : [
                                  (llcUnmasking.registeredAddress as any).street_address,
                                  (llcUnmasking.registeredAddress as any).locality,
                                  (llcUnmasking.registeredAddress as any).region,
                                  (llcUnmasking.registeredAddress as any).postal_code
                                ].filter(Boolean).join(', ')}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span className="font-medium">Officers & Members</span>
                      </div>
                      {(() => {
                        // Check if all officers are corporate entities (registered agents) rather than people
                        const corporatePatterns = /\b(COMPANY|CORP|INC|LLC|TRUST|NETWORK|SERVICE|SERVICES|CORPORATION|REGISTERED|AGENT)\b/i;
                        const officers = llcUnmasking.officers || [];
                        const allCorporateEntities = officers.length > 0 && officers.every(o => corporatePatterns.test(o.name));
                        const isDelawareLLC = llcUnmasking.jurisdictionCode === "us_de";
                        
                        // Helper to find all contact info for an officer from enrichment data
                        const getOfficerContacts = (officerName: string): { phones: string[], emails: string[] } => {
                          const phones: string[] = [];
                          const emails: string[] = [];
                          
                          const normName = officerName.toLowerCase().replace(/[^a-z\s]/g, '').trim();
                          const nameParts = normName.split(/\s+/).filter(p => p.length > 1);
                          
                          // Match function - check if at least 2 name parts match
                          const isMatch = (otherName: string) => {
                            const otherNorm = otherName.toLowerCase().replace(/[^a-z\s]/g, '').trim();
                            const otherParts = otherNorm.split(/\s+/).filter(p => p.length > 1);
                            const matches = nameParts.filter(p => otherParts.includes(p));
                            return matches.length >= 2 || (nameParts.length === 2 && matches.length >= 1 && otherParts.some(p => nameParts.includes(p)));
                          };
                          
                          // Search directDials
                          if (contactEnrichment?.directDials) {
                            contactEnrichment.directDials.forEach(dial => {
                              if (dial.name && isMatch(dial.name) && !phones.includes(dial.phone)) {
                                phones.push(dial.phone);
                              }
                            });
                          }
                          
                          // Search employeeProfiles  
                          if (contactEnrichment?.employeeProfiles) {
                            contactEnrichment.employeeProfiles.forEach(emp => {
                              if (isMatch(emp.name)) {
                                if (emp.phone && !phones.includes(emp.phone)) phones.push(emp.phone);
                                if (emp.email && !emails.includes(emp.email)) emails.push(emp.email);
                              }
                            });
                          }
                          
                          // Limit to first 3 of each to keep it clean
                          return { phones: phones.slice(0, 3), emails: emails.slice(0, 2) };
                        };
                        
                        return (
                          <>
                            {allCorporateEntities && (
                              <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm" data-testid="text-privacy-notice">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                  <div>
                                    <span className="font-medium text-amber-700 dark:text-amber-300">Privacy-Protected Entity</span>
                                    <p className="text-muted-foreground mt-1">
                                      {isDelawareLLC 
                                        ? "Delaware LLCs don't require public disclosure of actual owners. Only the registered agent is listed in public records."
                                        : "This entity only lists corporate service companies in public records. Actual owners are not disclosed."}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                            {officers.length > 0 ? (
                              <div className="space-y-2">
                                {officers.map((officer, idx) => {
                                  const officerContacts = getOfficerContacts(officer.name);
                                  const hasContacts = officerContacts.phones.length > 0 || officerContacts.emails.length > 0;
                                  
                                  return (
                                    <div 
                                      key={idx} 
                                      className="p-3 rounded-md bg-muted/50"
                                      data-testid={`text-llc-officer-${idx}`}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                          <div className="font-medium">{officer.name}</div>
                                          <div className="text-sm text-muted-foreground">{officer.position || officer.role}</div>
                                        </div>
                                        <Badge variant="outline" className="text-xs capitalize shrink-0">
                                          {officer.role}
                                        </Badge>
                                      </div>
                                      
                                      {/* Expandable contact info */}
                                      {hasContacts && (
                                        <Collapsible className="mt-2">
                                          <CollapsibleTrigger asChild>
                                            <Button 
                                              variant="ghost" 
                                              size="sm" 
                                              className="h-7 px-2 text-xs text-muted-foreground gap-1"
                                              data-testid={`button-view-contact-${idx}`}
                                            >
                                              <ChevronDown className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                                              View contact info
                                            </Button>
                                          </CollapsibleTrigger>
                                          <CollapsibleContent className="pt-2 space-y-1.5">
                                            {officerContacts.phones.map((phone, pidx) => (
                                              <div key={pidx} className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Phone className="h-3 w-3 shrink-0" />
                                                <span className="font-mono text-xs">{phone}</span>
                                              </div>
                                            ))}
                                            {officerContacts.emails.map((email, eidx) => (
                                              <div key={eidx} className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Mail className="h-3 w-3 shrink-0" />
                                                <span className="text-xs">{email}</span>
                                              </div>
                                            ))}
                                            {officer.address && (
                                              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                                                <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                                                <span className="text-xs">{officer.address}</span>
                                              </div>
                                            )}
                                          </CollapsibleContent>
                                        </Collapsible>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No officers found</p>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {llcUnmasking.registeredAgent && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <div className="font-medium text-sm">Registered Agent</div>
                          <div className="p-2 rounded-md bg-muted/50">
                            <div className="font-medium">{llcUnmasking.registeredAgent.name}</div>
                            {llcUnmasking.registeredAgent.address && (
                              <div className="text-sm text-muted-foreground">
                                {typeof llcUnmasking.registeredAgent.address === 'string' 
                                  ? llcUnmasking.registeredAgent.address 
                                  : [
                                      (llcUnmasking.registeredAgent.address as any).street_address,
                                      (llcUnmasking.registeredAgent.address as any).locality,
                                      (llcUnmasking.registeredAgent.address as any).region,
                                      (llcUnmasking.registeredAgent.address as any).postal_code
                                    ].filter(Boolean).join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {llcUnmasking.filings && llcUnmasking.filings.length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span className="font-medium">Recent Filings</span>
                          </div>
                          <div className="space-y-2">
                            {llcUnmasking.filings.slice(0, 5).map((filing, idx) => (
                              <div 
                                key={idx} 
                                className="flex items-center justify-between text-sm"
                                data-testid={`text-llc-filing-${idx}`}
                              >
                                <span>{filing.title}</span>
                                <span className="text-muted-foreground">
                                  {new Date(filing.date).toLocaleDateString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <div className="text-xs text-muted-foreground pt-2">
                      Last updated: {new Date(llcUnmasking.lastUpdated).toLocaleString()}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground text-sm mb-3">
                      No LLC data available. Click "Refresh Data" to fetch from OpenCorporates.
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => generateDossierMutation.mutate()}
                      disabled={generateDossierMutation.isPending}
                      data-testid="button-fetch-llc-data"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${generateDossierMutation.isPending ? "animate-spin" : ""}`} />
                      Fetch LLC Data
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Company Emails Section - only show if there are emails not already shown with officers */}
          {owner.type === "entity" && contactEnrichment?.companyEmails && contactEnrichment.companyEmails.length > 0 && (
            <Card data-testid="card-company-emails">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Company Emails
                  <Badge variant="secondary" className="text-xs">
                    {contactEnrichment.companyEmails.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contactEnrichment.companyEmails.slice(0, 5).map((email, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                      data-testid={`text-email-${idx}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <AtSign className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-mono text-sm truncate">{email.email}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">{email.confidence}%</Badge>
                    </div>
                  ))}
                </div>
                {contactEnrichment.sources && (
                  <div className="text-xs text-muted-foreground pt-3">
                    Sources: {contactEnrichment.sources.join(", ")}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {melissaEnrichment && (
            <Card data-testid="card-melissa-enrichment">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Address & Identity Verification
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {melissaEnrichment.nameMatch && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span className="font-medium">Name Match</span>
                      {melissaEnrichment.nameMatch.verified && (
                        <Badge variant="default" className="text-xs">Verified</Badge>
                      )}
                    </div>
                    <div className="p-2 rounded-md bg-muted/50">
                      <div className="font-medium">{melissaEnrichment.nameMatch.standardizedName.full}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Confidence: {melissaEnrichment.nameMatch.confidence}%
                      </div>
                    </div>
                  </div>
                )}

                {melissaEnrichment.addressMatch && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span className="font-medium">Address Match</span>
                        {melissaEnrichment.addressMatch.verified && (
                          <Badge variant="default" className="text-xs">Verified</Badge>
                        )}
                      </div>
                      <div className="p-2 rounded-md bg-muted/50">
                        <div>{melissaEnrichment.addressMatch.standardizedAddress.line1}</div>
                        <div className="text-sm text-muted-foreground">
                          {melissaEnrichment.addressMatch.standardizedAddress.city}, {melissaEnrichment.addressMatch.standardizedAddress.state} {melissaEnrichment.addressMatch.standardizedAddress.zip}
                        </div>
                        {melissaEnrichment.addressMatch.standardizedAddress.county && (
                          <div className="text-xs text-muted-foreground mt-1">
                            County: {melissaEnrichment.addressMatch.standardizedAddress.county}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs">
                          <Badge variant="outline" className="capitalize">{melissaEnrichment.addressMatch.residenceType}</Badge>
                          <span className="text-muted-foreground">Deliverability: {melissaEnrichment.addressMatch.deliverability}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {melissaEnrichment.phoneMatches && melissaEnrichment.phoneMatches.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span className="font-medium">Phone Matches</span>
                      </div>
                      <div className="space-y-2">
                        {melissaEnrichment.phoneMatches.map((phone, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                            data-testid={`text-melissa-phone-${idx}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">{phone.phone}</span>
                              {phone.verified && <Badge variant="default" className="text-xs">Verified</Badge>}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs capitalize">{phone.type}</Badge>
                              <Badge variant="secondary" className="text-xs">{phone.confidence}%</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {melissaEnrichment.occupancy && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="font-medium text-sm">Occupancy Status</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Current Occupant</span>
                          <Badge variant={melissaEnrichment.occupancy.currentOccupant ? "default" : "secondary"}>
                            {melissaEnrichment.occupancy.currentOccupant ? "Yes" : "No"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Owner Occupied</span>
                          <Badge variant={melissaEnrichment.occupancy.ownerOccupied ? "default" : "secondary"}>
                            {melissaEnrichment.occupancy.ownerOccupied ? "Yes" : "No"}
                          </Badge>
                        </div>
                        {melissaEnrichment.occupancy.lengthOfResidence && (
                          <div className="col-span-2 flex items-center justify-between">
                            <span className="text-muted-foreground">Length of Residence</span>
                            <span>{melissaEnrichment.occupancy.lengthOfResidence} years</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {melissaEnrichment.moveHistory && melissaEnrichment.moveHistory.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        <span className="font-medium">Move History</span>
                      </div>
                      <div className="space-y-2">
                        {melissaEnrichment.moveHistory.map((move, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                            data-testid={`text-move-history-${idx}`}
                          >
                            <div>
                              <div className="text-sm">{move.address}</div>
                              <div className="text-xs text-muted-foreground">
                                {move.moveInDate && `Moved in: ${move.moveInDate}`}
                                {move.moveOutDate && ` | Moved out: ${move.moveOutDate}`}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs capitalize">{move.type}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="text-xs text-muted-foreground pt-2">
                  Last updated: {new Date(melissaEnrichment.lastUpdated).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          )}

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

          {/* Business Contact Information */}
          <Card data-testid="card-contact-info">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Business Phone from Data Axle Places */}
              {contactEnrichment?.directDials && contactEnrichment.directDials.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Business Contacts
                  </div>
                  {contactEnrichment.directDials.slice(0, 3).map((dial, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                      data-testid={`contact-business-${idx}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="font-mono text-sm truncate">{dial.phone}</div>
                          {dial.name && (
                            <div className="text-xs text-muted-foreground truncate">{dial.name}</div>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize shrink-0">{dial.type}</Badge>
                    </div>
                  ))}
                </div>
              )}

              {/* Existing stored contacts */}
              {contacts.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Saved Contacts
                  </div>
                  {contacts.slice(0, 5).map((contact) => (
                    <div 
                      key={contact.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                      data-testid={`contact-saved-${contact.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {contact.kind === "phone" ? (
                          <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-mono text-sm truncate">{contact.value}</span>
                      </div>
                      {contact.confidenceScore && (
                        <Badge variant="secondary" className="text-xs shrink-0">{contact.confidenceScore}%</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(!contactEnrichment?.directDials?.length && !contacts.length) && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No contact information available
                </div>
              )}
            </CardContent>
          </Card>

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
