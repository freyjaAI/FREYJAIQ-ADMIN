import { useRoute, Link, useLocation } from "wouter";
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
  ExternalLink,
  Brain,
  GitBranch,
  ChevronRight,
  Zap,
  Database,
  Clock,
  Loader2,
  DollarSign,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
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
import { FranchiseInfoCard } from "@/components/franchise-badge";
import { EnrichmentPipelineBar } from "@/components/enrichment-pipeline-bar";
import { TargetedEnrichmentDropdown } from "@/components/targeted-enrichment-dropdown";
import { SourcesStrip } from "@/components/sources-strip";
import { ErrorBannerContainer } from "@/components/error-banner";
import { FadeIn, StaggerContainer, StaggerItem, HighlightOnUpdate, AnimatedList } from "@/components/animated-list";
import { FullDossierSkeleton, ContactsSectionSkeleton, PropertiesSectionSkeleton, LlcCardSkeleton, InlineListSkeleton } from "@/components/dossier-skeletons";
import { FreyjaLoader, FreyjaFullPageLoader } from "@/components/freyja-loader";
import { AIDisclosureBadge, AIDisclaimer } from "@/components/ai-disclosure-badge";
import type { Owner, Property, ContactInfo, LegalEvent, OwnerLlcLink, ProviderSource } from "@shared/schema";

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
    address?: string;
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
  isPrivacyProtected?: boolean;
  aiInferredOwners?: Array<{
    name: string;
    role: string;
    confidence: "high" | "medium" | "low";
    sources: string[];
    reasoning: string;
  }>;
  aiRelatedEntities?: string[];
  aiCitations?: string[];
}

interface SkipTraceAddress {
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  county?: string;
  timespan?: string;
}

interface SkipTraceRelative {
  name: string;
  age?: string;
}

interface SkipTraceData {
  firstName?: string;
  lastName?: string;
  age?: string;
  born?: string;
  currentAddress?: SkipTraceAddress;
  previousAddresses: SkipTraceAddress[];
  relatives: SkipTraceRelative[];
  associates: SkipTraceRelative[];
  personLink?: string;
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
    address?: string;
    linkedin?: string;
    confidence: number;
  }>;
  skipTraceData?: SkipTraceData | null;
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

interface OwnershipChainNode {
  name: string;
  type: "entity" | "individual";
  role?: string;
  confidence?: number;
  jurisdiction?: string;
  registeredAgent?: string;
  depth: number;
}

interface OwnershipChainData {
  rootEntity: string;
  levels: Array<{
    depth: number;
    entities: OwnershipChainNode[];
  }>;
  ultimateBeneficialOwners: OwnershipChainNode[];
  maxDepthReached: boolean;
  totalApiCalls: number;
  fromCache: boolean;
  cacheAge?: number;
}

interface RelatedHolding {
  owner: Owner;
  properties: Property[];
  relationship: string;
  confidence: number;
}

interface PersonPropertyLinks {
  personName: string;
  directProperties: Property[];
  llcHoldings: RelatedHolding[];
  relatedOwners: RelatedHolding[];
  totalProperties: number;
  totalLlcs: number;
}

function ClickableEntityName({ 
  name, 
  type,
  role,
  addressHint,
  className = "" 
}: { 
  name: string; 
  type?: "entity" | "individual";
  role?: string;
  /** Address hint for contact enrichment filtering (e.g., property address) */
  addressHint?: string;
  className?: string;
}) {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isLoading) return;
    setIsLoading(true);
    
    try {
      const response = await apiRequest("POST", "/api/owners/resolve-by-name", {
        name,
        type: type || undefined,
        addressHint: addressHint || undefined,
      });
      
      const data = await response.json();
      
      if (data.owner?.id) {
        setLocation(`/owners/${data.owner.id}`);
        
        if (data.isNew) {
          toast({
            title: "New entity created",
            description: `Created dossier for "${name}". Running enrichment...`,
          });
        }
      }
    } catch (error) {
      console.error("Failed to resolve entity:", error);
      toast({
        title: "Navigation failed",
        description: "Could not navigate to entity dossier",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isEntity = type === "entity" || 
    /\b(LLC|INC|CORP|TRUST|PROPERTIES|HOLDINGS|REALTY|COMPANY|LTD)\b/i.test(name);

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`text-left font-medium underline underline-offset-2 hover:text-primary cursor-pointer inline-flex items-center gap-1 ${isLoading ? "opacity-50" : ""} ${className}`}
      data-testid={`link-entity-${name.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {isEntity ? (
        <Building2 className="h-3 w-3 shrink-0" />
      ) : (
        <User className="h-3 w-3 shrink-0" />
      )}
      <span className="truncate">{name}</span>
      {role && <span className="text-xs text-muted-foreground">({role})</span>}
      <ChevronRight className="h-3 w-3 shrink-0" />
      {isLoading && <RefreshCw className="h-3 w-3 animate-spin" />}
    </button>
  );
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

interface EnrichmentError {
  id: string;
  title: string;
  message: string;
  onRetry?: () => void;
}

export default function OwnerDossierPage() {
  const [, params] = useRoute("/owners/:id");
  const ownerId = params?.id;
  const { toast } = useToast();
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [enrichmentErrors, setEnrichmentErrors] = useState<EnrichmentError[]>([]);
  const [retryingIds, setRetryingIds] = useState<string[]>([]);

  const { data: dossier, isLoading, refetch, dataUpdatedAt } = useQuery<DossierData>({
    queryKey: ["/api/owners", ownerId, "dossier"],
    enabled: !!ownerId,
  });

  const dismissError = useCallback((errorId: string) => {
    setEnrichmentErrors(prev => prev.filter(e => e.id !== errorId));
  }, []);

  const addEnrichmentError = useCallback((error: EnrichmentError) => {
    setEnrichmentErrors(prev => {
      if (prev.some(e => e.id === error.id)) return prev;
      return [...prev, error];
    });
  }, []);

  const handleEnrichmentComplete = useCallback((result: any) => {
    refetch();
    if (result?.overallStatus === "failed" || result?.overallStatus === "partial") {
      const failedSteps = result?.steps?.filter((s: any) => s.status === "error") || [];
      failedSteps.forEach((step: any) => {
        addEnrichmentError({
          id: `enrichment-${step.id}`,
          title: `${step.label} failed`,
          message: step.error || "An error occurred during enrichment",
          onRetry: () => refetch(),
        });
      });
    }
  }, [refetch, addEnrichmentError]);

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

  // Mutation to clear ownership chain cache and refetch
  const clearOwnershipCacheMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", `/api/external/llc-ownership-chain?name=${encodeURIComponent(dossier?.owner?.name || "")}&forceRefresh=true`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/external/llc-ownership-chain?name=${encodeURIComponent(dossier?.owner?.name || "")}`] });
      toast({ title: "Cache cleared", description: "Ownership chain refreshed with latest data." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to refresh ownership chain.", variant: "destructive" });
    },
  });

  // Fetch ownership chain for entity owners
  // API returns flat `chain` array, we transform it to `levels` grouped by depth
  const ownershipChainQuery = useQuery<OwnershipChainData>({
    queryKey: [`/api/external/llc-ownership-chain?name=${encodeURIComponent(dossier?.owner?.name || "")}`],
    enabled: !!dossier?.owner?.type && dossier.owner.type === "entity" && !!dossier.owner.name,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    select: (data: any): OwnershipChainData => {
      // Transform flat chain to grouped levels
      const chain = data.chain || [];
      const depthMap = new Map<number, OwnershipChainNode[]>();
      
      for (const node of chain) {
        const depth = node.depth ?? 0;
        if (!depthMap.has(depth)) {
          depthMap.set(depth, []);
        }
        depthMap.get(depth)!.push(node);
      }
      
      const levels = Array.from(depthMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([depth, entities]) => ({ depth, entities }));
      
      return {
        rootEntity: data.rootEntityName || "",
        levels,
        ultimateBeneficialOwners: data.ultimateBeneficialOwners || [],
        maxDepthReached: data.maxDepthReached || false,
        totalApiCalls: data.totalApiCalls || 0,
        fromCache: data.fromCache || false,
        cacheAge: data.cacheAge,
      };
    },
  });

  // Fetch related holdings for individual owners (cross-property links)
  const relatedHoldingsQuery = useQuery<PersonPropertyLinks>({
    queryKey: [`/api/persons/${encodeURIComponent(dossier?.owner?.name || "")}/related-holdings?excludeOwnerId=${dossier?.owner?.id || ""}`],
    enabled: !!dossier?.owner?.type && dossier.owner.type === "individual" && !!dossier.owner.name,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  // Fetch linked individuals for LLC/entity owners (bidirectional linking)
  const linkedIndividualsQuery = useQuery<{
    linkedIndividuals: Array<{
      id: string;
      name: string;
      relationship: string;
      confidence: number;
      primaryAddress?: string;
    }>;
  }>({
    queryKey: [`/api/owners/${dossier?.owner?.id}/linked-individuals`],
    enabled: !!dossier?.owner?.type && dossier.owner.type === "entity" && !!dossier.owner.id,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <FreyjaLoader 
          message="Enriching through proprietary FreyjaIQ waterfall" 
          submessage="Loading owner dossier with AI insights..."
          size="lg"
        />
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

  const { owner, properties, contacts, legalEvents, linkedLlcs, aiOutreach, scoreBreakdown, llcUnmasking, contactEnrichment, melissaEnrichment, sources } =
    dossier as typeof dossier & { sources?: ProviderSource[] };

  const totalPropertyValue = properties.reduce(
    (sum, p) => sum + (p.marketValue ?? p.assessedValue ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <ErrorBannerContainer
        errors={enrichmentErrors}
        onDismiss={dismissError}
        retryingIds={retryingIds}
      />
      
      <FadeIn>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 sm:gap-4">
            <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] shrink-0" asChild data-testid="button-back">
              <Link href="/owners">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold break-words">{owner.name}</h1>
                <EntityTypeBadge type={owner.type} />
                {owner.riskFlags?.map((flag) => (
                  <RiskBadge key={flag} type={flag} />
                ))}
              </div>
              {owner.primaryAddress && (
                <p className="text-muted-foreground mt-1">{owner.primaryAddress}</p>
              )}

              <div className="mt-4">
                <EnrichmentPipelineBar
                  entityId={owner.id}
                  entityName={owner.name}
                  entityType={owner.type as "individual" | "entity"}
                  onEnrichmentComplete={handleEnrichmentComplete}
                />
              </div>
            
            {sources && sources.length > 0 && (
              <div className="mt-3">
                <SourcesStrip 
                  sources={sources}
                  onRetry={undefined}
                  isRetrying={false}
                />
              </div>
            )}
            
            {/* Person Details for Individual Owners - uses owner record data or skipTraceData fallback */}
            {owner.type === "individual" && (
              (owner as any).age || (owner as any).relatives?.length > 0 || (owner as any).associates?.length > 0 || 
              (owner as any).previousAddresses?.length > 0 || contactEnrichment?.skipTraceData
            ) && (
              <Collapsible className="mt-3">
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 px-3 text-sm text-muted-foreground gap-1.5"
                    data-testid="button-view-person-details"
                  >
                    <User className="h-4 w-4" />
                    View Person Details
                    <ChevronDown className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <Card className="bg-muted/30">
                    <CardContent className="pt-4 space-y-4">
                      {/* Personal Info - prefer owner record, fallback to skipTraceData */}
                      {(() => {
                        const age = (owner as any).age || contactEnrichment?.skipTraceData?.age;
                        const birthDate = (owner as any).birthDate || contactEnrichment?.skipTraceData?.born;
                        const currentAddress = contactEnrichment?.skipTraceData?.currentAddress;
                        return (age || currentAddress) ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {age && (
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span>Age: <span className="font-medium">{age}</span></span>
                                {birthDate && (
                                  <span className="text-muted-foreground">(Born {birthDate})</span>
                                )}
                              </div>
                            )}
                            {currentAddress && (
                              <div className="flex items-start gap-2 text-sm">
                                <Home className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                <span>
                                  {currentAddress.streetAddress}, {currentAddress.city}, {currentAddress.state} {currentAddress.postalCode}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : null;
                      })()}

                      {/* Relatives - prefer owner record, fallback to skipTraceData */}
                      {(() => {
                        const relatives: Array<{name: string; age?: number | string}> = 
                          (owner as any).relatives || contactEnrichment?.skipTraceData?.relatives || [];
                        return relatives.length > 0 ? (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">Relatives ({relatives.length})</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {relatives.slice(0, 10).map((relative, idx) => (
                                <Badge 
                                  key={idx} 
                                  variant="secondary" 
                                  className="text-xs"
                                  data-testid={`badge-relative-${idx}`}
                                >
                                  {relative.name}
                                  {relative.age && <span className="text-muted-foreground ml-1">({relative.age})</span>}
                                </Badge>
                              ))}
                              {relatives.length > 10 && (
                                <Badge variant="outline" className="text-xs">
                                  +{relatives.length - 10} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        ) : null;
                      })()}

                      {/* Associates - prefer owner record, fallback to skipTraceData */}
                      {(() => {
                        const associates: Array<{name: string; age?: number | string}> = 
                          (owner as any).associates || contactEnrichment?.skipTraceData?.associates || [];
                        return associates.length > 0 ? (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">Associates ({associates.length})</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {associates.slice(0, 10).map((assoc, idx) => (
                                <Badge 
                                  key={idx} 
                                  variant="outline" 
                                  className="text-xs"
                                  data-testid={`badge-associate-${idx}`}
                                >
                                  {assoc.name}
                                  {assoc.age && <span className="text-muted-foreground ml-1">({assoc.age})</span>}
                                </Badge>
                              ))}
                              {associates.length > 10 && (
                                <Badge variant="outline" className="text-xs">
                                  +{associates.length - 10} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        ) : null;
                      })()}

                      {/* Previous Addresses - prefer owner record, fallback to skipTraceData */}
                      {(() => {
                        const ownerAddresses = (owner as any).previousAddresses || [];
                        const skipAddresses = contactEnrichment?.skipTraceData?.previousAddresses || [];
                        const previousAddresses = ownerAddresses.length > 0 ? ownerAddresses : skipAddresses;
                        return previousAddresses.length > 0 ? (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Truck className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">Previous Addresses ({previousAddresses.length})</span>
                            </div>
                            <div className="space-y-2">
                              {previousAddresses.slice(0, 5).map((addr: any, idx: number) => (
                                <div 
                                  key={idx} 
                                  className="flex items-start gap-2 text-sm text-muted-foreground"
                                  data-testid={`text-previous-address-${idx}`}
                                >
                                  <MapPin className="h-3 w-3 shrink-0 mt-1" />
                                  <span>
                                    {addr.address || addr.streetAddress}, {addr.city}, {addr.state} {addr.zip || addr.postalCode}
                                    {addr.timespan && <span className="italic ml-2">({addr.timespan})</span>}
                                  </span>
                                </div>
                              ))}
                              {previousAddresses.length > 5 && (
                                <div className="text-xs text-muted-foreground">
                                  +{previousAddresses.length - 5} more addresses
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null;
                      })()}

                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="min-h-[44px] flex-1 sm:flex-none"
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
            className="min-h-[44px] flex-1 sm:flex-none"
            onClick={() => exportPdfMutation.mutate()}
            disabled={exportPdfMutation.isPending}
            data-testid="button-export-pdf"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
        </div>
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card-static p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`text-4xl font-bold tracking-tight ${properties.length > 0 ? "text-green-500" : "text-foreground"}`}>
                    {properties.length}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">Properties</div>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${properties.length > 0 ? "bg-green-500/10" : "bg-primary/10"}`}>
                  <Building2 className={`h-6 w-6 ${properties.length > 0 ? "text-green-500" : "text-primary"}`} />
                </div>
              </div>
            </div>
            <div className="glass-card-static p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-4xl font-bold tracking-tight text-green-500">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                      notation: totalPropertyValue >= 1000000 ? "compact" : "standard",
                    }).format(totalPropertyValue)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">Total Value</div>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                  <DollarSign className="h-6 w-6 text-green-500" />
                </div>
              </div>
            </div>
            <div className="glass-card-static p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`text-4xl font-bold tracking-tight ${linkedLlcs.length > 0 ? "text-primary" : "text-muted-foreground"}`}>
                    {linkedLlcs.length}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">LLCs</div>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${linkedLlcs.length > 0 ? "bg-primary/10" : "bg-muted/50"}`}>
                  <GitBranch className={`h-6 w-6 ${linkedLlcs.length > 0 ? "text-primary" : "text-muted-foreground"}`} />
                </div>
              </div>
            </div>
          </div>

          {owner.type === "entity" && (
            <Card data-testid="card-llc-unmasking" role="region" aria-labelledby="llc-info-heading">
              <CardHeader className="pb-3">
                <CardTitle id="llc-info-heading" className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" aria-hidden="true" />
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
                        const allOfficers = llcUnmasking.officers || [];
                        // Filter out officers with empty/blank names (just role labels)
                        const officers = allOfficers.filter(o => o.name && o.name.trim() && o.name.trim().toLowerCase() !== "member" && o.name.trim().toLowerCase() !== "officer");
                        const allCorporateEntities = officers.length > 0 && officers.every(o => corporatePatterns.test(o.name));
                        const hasOnlyRoleLabels = allOfficers.length > 0 && officers.length === 0;
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
                            
                            {/* AI-Inferred Owners Section */}
                            {llcUnmasking.aiInferredOwners && llcUnmasking.aiInferredOwners.length > 0 && (
                              <div className="space-y-3 mt-4" data-testid="section-ai-inferred-owners">
                                <div className="flex items-center gap-2">
                                  <Brain className="h-4 w-4 text-violet-500" />
                                  <span className="font-medium">AI-Discovered Owners</span>
                                  <Badge variant="secondary" className="text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20">
                                    AI-Inferred
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  These potential owners were discovered through AI-powered web research. Verify before use.
                                </p>
                                <div className="space-y-2">
                                  {llcUnmasking.aiInferredOwners.map((owner, idx) => (
                                    <div 
                                      key={idx} 
                                      className="p-3 rounded-md bg-violet-500/5 border border-violet-500/20"
                                      data-testid={`card-ai-owner-${idx}`}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                          <div className="font-medium flex items-center gap-2">
                                            {owner.name}
                                            <Badge 
                                              variant="outline" 
                                              className={`text-xs capitalize ${
                                                owner.confidence === 'high' 
                                                  ? 'border-green-500/50 text-green-600 dark:text-green-400' 
                                                  : owner.confidence === 'medium' 
                                                    ? 'border-yellow-500/50 text-yellow-600 dark:text-yellow-400'
                                                    : 'border-muted-foreground/50 text-muted-foreground'
                                              }`}
                                            >
                                              {owner.confidence} confidence
                                            </Badge>
                                          </div>
                                          <div className="text-sm text-muted-foreground">{owner.role}</div>
                                          {owner.reasoning && (
                                            <p className="text-xs text-muted-foreground mt-2 italic">
                                              {owner.reasoning}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                
                                {/* Related Entities */}
                                {llcUnmasking.aiRelatedEntities && llcUnmasking.aiRelatedEntities.length > 0 && (
                                  <div className="mt-3">
                                    <div className="text-sm font-medium mb-2">Related Entities</div>
                                    <div className="flex flex-wrap gap-2">
                                      {llcUnmasking.aiRelatedEntities.map((entity, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs">
                                          {entity}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Citations */}
                                {llcUnmasking.aiCitations && llcUnmasking.aiCitations.length > 0 && (
                                  <Collapsible className="mt-3">
                                    <CollapsibleTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-7 px-2 text-xs text-muted-foreground gap-1"
                                        data-testid="button-view-citations"
                                      >
                                        <ChevronDown className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                                        View {llcUnmasking.aiCitations.length} source{llcUnmasking.aiCitations.length > 1 ? 's' : ''}
                                      </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="pt-2 space-y-1">
                                      {llcUnmasking.aiCitations.slice(0, 5).map((citation, idx) => {
                                        const displayUrl = citation.length > 60 ? citation.substring(0, 60) + '...' : citation;
                                        return (
                                          <a 
                                            key={idx}
                                            href={citation}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                            data-testid={`link-citation-${idx}`}
                                          >
                                            <ExternalLink className="h-3 w-3 shrink-0" />
                                            <span className="truncate">{displayUrl}</span>
                                          </a>
                                        );
                                      })}
                                    </CollapsibleContent>
                                  </Collapsible>
                                )}
                              </div>
                            )}
                            {hasOnlyRoleLabels && (
                              <div className="p-3 rounded-md bg-muted/50 text-sm text-muted-foreground" data-testid="text-no-names-notice">
                                <div className="flex items-start gap-2">
                                  <Users className="h-4 w-4 mt-0.5 shrink-0" />
                                  <div>
                                    <span>Public records show {allOfficers.length} {allOfficers.length === 1 ? 'officer/member' : 'officers/members'} but individual names are not disclosed.</span>
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
                                          <ClickableEntityName name={officer.name} />
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
                            ) : !hasOnlyRoleLabels ? (
                              <p className="text-sm text-muted-foreground">No officers found</p>
                            ) : null}
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

          {/* Ownership Chain Visualization - shows nested LLC structure */}
          {owner.type === "entity" && (
            <Card data-testid="card-ownership-chain" role="region" aria-labelledby="ownership-chain-heading">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle id="ownership-chain-heading" className="text-base flex items-center gap-2">
                    <GitBranch className="h-4 w-4" aria-hidden="true" />
                    Ownership Chain
                    {ownershipChainQuery.data?.ultimateBeneficialOwners && (
                      <Badge variant="secondary" className="text-xs">
                        {ownershipChainQuery.data.ultimateBeneficialOwners.length} UBOs
                      </Badge>
                    )}
                  </CardTitle>
                  <TargetedEnrichmentDropdown
                    entityId={ownerId!}
                    entityType="entity"
                    targets={["ownership"]}
                    onEnrichmentComplete={() => {
                      refetch();
                      ownershipChainQuery.refetch();
                    }}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {ownershipChainQuery.isLoading ? (
                  <InlineListSkeleton count={2} />
                ) : ownershipChainQuery.data ? (
                  <>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-3">
                      <span>
                        Traced through {ownershipChainQuery.data.levels?.length || 0} layers
                        {ownershipChainQuery.data.maxDepthReached && " (max depth reached)"}
                        {ownershipChainQuery.data.fromCache && ` • Cached ${ownershipChainQuery.data.cacheAge}h ago`}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearOwnershipCacheMutation.mutate()}
                        disabled={clearOwnershipCacheMutation.isPending}
                        className="h-6 text-xs gap-1"
                        data-testid="button-refresh-ownership"
                      >
                        <RefreshCw className={`h-3 w-3 ${clearOwnershipCacheMutation.isPending ? "animate-spin" : ""}`} />
                        {clearOwnershipCacheMutation.isPending ? "Refreshing..." : "Refresh"}
                      </Button>
                    </div>
                    
                    {/* Chain Visualization */}
                    <div className="space-y-2">
                      {ownershipChainQuery.data.levels?.map((level, levelIdx) => (
                        <div key={levelIdx} className="relative">
                          {levelIdx > 0 && (
                            <div className="absolute left-3 -top-2 h-2 w-px bg-border" />
                          )}
                          <div className="flex items-start gap-2">
                            <div className="flex flex-col items-center">
                              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium
                                ${level.depth === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                {level.depth}
                              </div>
                              {levelIdx < (ownershipChainQuery.data.levels?.length || 0) - 1 && (
                                <div className="h-full w-px bg-border flex-1 min-h-4" />
                              )}
                            </div>
                            <div className="flex-1 space-y-1 pb-2">
                              {level.entities.map((entity, entityIdx) => (
                                <div 
                                  key={entityIdx}
                                  className={`p-2 rounded-md text-sm ${
                                    entity.type === "individual" 
                                      ? "bg-green-500/10 border border-green-500/20" 
                                      : "bg-muted/50"
                                  }`}
                                  data-testid={`chain-node-${level.depth}-${entityIdx}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <ClickableEntityName 
                                      name={entity.name} 
                                      type={entity.type}
                                      addressHint={owner.primaryAddress || undefined}
                                    />
                                    {entity.role && (
                                      <Badge 
                                        variant="outline" 
                                        className="text-xs capitalize max-w-[180px] truncate"
                                        title={entity.role}
                                      >
                                        {entity.role}
                                      </Badge>
                                    )}
                                  </div>
                                  {entity.jurisdiction && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {entity.jurisdiction.toUpperCase().replace("US_", "")}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Ultimate Beneficial Owners Summary */}
                    {ownershipChainQuery.data.ultimateBeneficialOwners?.length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Users className="h-4 w-4 text-green-600" />
                            Ultimate Beneficial Owners
                          </div>
                          <div className="grid gap-2">
                            {ownershipChainQuery.data.ultimateBeneficialOwners.map((ubo, idx) => (
                              <div 
                                key={idx}
                                className="p-2 rounded-md bg-green-500/10 border border-green-500/20 flex items-center justify-between gap-2 min-w-0"
                                data-testid={`ubo-${idx}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <ClickableEntityName 
                                    name={ubo.name} 
                                    type={ubo.type}
                                    addressHint={owner.primaryAddress || undefined}
                                  />
                                </div>
                                {ubo.role && (
                                  <Badge 
                                    variant="outline" 
                                    className="text-xs capitalize max-w-[180px] truncate shrink-0"
                                    title={ubo.role}
                                  >
                                    {ubo.role}
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">
                      Ownership chain not yet resolved. This feature traces ownership through nested LLCs.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Related Holdings Section - for individual owners, shows other properties they own through LLCs */}
          {owner.type === "individual" && (
            <Card data-testid="card-related-holdings" role="region" aria-labelledby="related-holdings-heading">
              <CardHeader className="pb-3">
                <CardTitle id="related-holdings-heading" className="text-base flex items-center gap-2">
                  <Home className="h-4 w-4" aria-hidden="true" />
                  Related Holdings
                  {relatedHoldingsQuery.data && (
                    <Badge variant="secondary" className="text-xs">
                      {relatedHoldingsQuery.data.totalProperties} properties via {relatedHoldingsQuery.data.totalLlcs} LLCs
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {relatedHoldingsQuery.isLoading ? (
                  <InlineListSkeleton count={3} />
                ) : relatedHoldingsQuery.data && (relatedHoldingsQuery.data.llcHoldings.length > 0 || relatedHoldingsQuery.data.directProperties.length > 0) ? (
                  <>
                    {/* LLC Holdings */}
                    {relatedHoldingsQuery.data.llcHoldings.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Building2 className="h-4 w-4" />
                          Properties via LLCs
                        </div>
                        <div className="space-y-3">
                          {relatedHoldingsQuery.data.llcHoldings.map((holding, idx) => (
                            <div 
                              key={idx}
                              className="p-3 rounded-md border bg-muted/30"
                              data-testid={`llc-holding-${idx}`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <Link 
                                    href={`/owners/${holding.owner.id}`}
                                    className="font-medium text-sm hover:underline"
                                  >
                                    {holding.owner.name}
                                  </Link>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {holding.relationship}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs">
                                    {holding.confidence}% match
                                  </Badge>
                                </div>
                              </div>
                              <div className="space-y-1 ml-6">
                                {holding.properties.slice(0, 3).map((prop, propIdx) => (
                                  <div 
                                    key={propIdx}
                                    className="flex items-center gap-2 text-sm text-muted-foreground"
                                  >
                                    <MapPin className="h-3 w-3" />
                                    <span className="truncate">{prop.address}</span>
                                    {prop.assessedValue && (
                                      <span className="shrink-0">
                                        ${(prop.assessedValue / 1000000).toFixed(1)}M
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {holding.properties.length > 3 && (
                                  <div className="text-xs text-muted-foreground ml-5">
                                    +{holding.properties.length - 3} more properties
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Direct Properties from name matches */}
                    {relatedHoldingsQuery.data.directProperties.length > 0 && (
                      <>
                        {relatedHoldingsQuery.data.llcHoldings.length > 0 && <Separator />}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Home className="h-4 w-4" />
                            Other Direct Holdings
                          </div>
                          <div className="space-y-2">
                            {relatedHoldingsQuery.data.directProperties.slice(0, 5).map((prop, idx) => (
                              <div 
                                key={idx}
                                className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
                                data-testid={`direct-property-${idx}`}
                              >
                                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm truncate">{prop.address}</span>
                                {prop.assessedValue && (
                                  <Badge variant="secondary" className="text-xs shrink-0">
                                    ${(prop.assessedValue / 1000000).toFixed(1)}M
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">
                      No additional holdings found for this person across other LLCs or properties.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Linked Individuals Section - for LLC/entity owners, shows individuals connected to this entity */}
          {owner.type === "entity" && (
            <Card data-testid="card-linked-individuals" role="region" aria-labelledby="linked-individuals-heading">
              <CardHeader className="pb-3">
                <CardTitle id="linked-individuals-heading" className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  Linked Individuals
                  {linkedIndividualsQuery.data && linkedIndividualsQuery.data.linkedIndividuals.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {linkedIndividualsQuery.data.linkedIndividuals.length} people
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {linkedIndividualsQuery.isLoading ? (
                  <InlineListSkeleton count={3} />
                ) : linkedIndividualsQuery.data && linkedIndividualsQuery.data.linkedIndividuals.length > 0 ? (
                  <div className="space-y-2">
                    {linkedIndividualsQuery.data.linkedIndividuals.map((person, idx) => (
                      <Link 
                        key={idx}
                        href={`/owners/${person.id}`}
                        className="flex items-center justify-between p-3 rounded-md border bg-muted/30 hover-elevate"
                        data-testid={`linked-individual-${idx}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium text-sm">{person.name}</div>
                            {person.primaryAddress && (
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {person.primaryAddress}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs capitalize">
                            {person.relationship}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {person.confidence}% match
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">
                      No linked individuals found. Run LLC unmasking to discover connected people.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Contact Information Section - show for both individual and entity owners */}
          {contactEnrichment && (
            (contactEnrichment.companyEmails?.length > 0 || contactEnrichment.directDials?.length > 0 || contactEnrichment.employeeProfiles?.length > 0) ? (
            <HighlightOnUpdate 
              updateKey={(contactEnrichment.directDials?.length || 0) + (contactEnrichment.companyEmails?.length || 0)} 
              className="rounded-md"
            >
            <Card data-testid="card-contact-enrichment" role="region" aria-labelledby="contact-info-heading">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle id="contact-info-heading" className="text-base flex items-center gap-2">
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    Contact Information
                    <Badge variant="secondary" className="text-xs">
                      {(contactEnrichment.directDials?.length || 0) + (contactEnrichment.companyEmails?.length || 0)}
                    </Badge>
                  </CardTitle>
                  <TargetedEnrichmentDropdown
                    entityId={ownerId!}
                    entityType={owner.type === "individual" ? "individual" : "entity"}
                    targets={["contacts"]}
                    onEnrichmentComplete={() => refetch()}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Phone Numbers */}
                {contactEnrichment.directDials && contactEnrichment.directDials.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Phone className="h-4 w-4" />
                      Phone Numbers
                    </div>
                    <div className="space-y-2">
                      {contactEnrichment.directDials.slice(0, 5).map((dial, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                          data-testid={`text-phone-${idx}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-mono text-sm">{dial.phone}</span>
                            {dial.type && (
                              <Badge variant="outline" className="text-xs capitalize">{dial.type}</Badge>
                            )}
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0">{dial.confidence}%</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Email Addresses */}
                {contactEnrichment.companyEmails && contactEnrichment.companyEmails.length > 0 && (
                  <>
                    {contactEnrichment.directDials && contactEnrichment.directDials.length > 0 && <Separator />}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Mail className="h-4 w-4" />
                        Email Addresses
                      </div>
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
                    </div>
                  </>
                )}

                {/* Employee/Contact Profiles - only show if we have them */}
                {contactEnrichment.employeeProfiles && contactEnrichment.employeeProfiles.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <User className="h-4 w-4" />
                        Contact Profiles
                      </div>
                      <div className="space-y-2">
                        {contactEnrichment.employeeProfiles.slice(0, 3).map((profile, idx) => (
                          <div 
                            key={idx} 
                            className="p-2 rounded-md bg-muted/50"
                            data-testid={`text-profile-${idx}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-sm">{profile.name}</div>
                              <Badge variant="secondary" className="text-xs">{profile.confidence}%</Badge>
                            </div>
                            {profile.title && (
                              <div className="text-xs text-muted-foreground">{profile.title}</div>
                            )}
                            {(profile.email || profile.phone || profile.address) && (
                              <div className="flex flex-col gap-1 mt-1 text-xs">
                                {profile.phone && (
                                  <div className="flex items-center gap-1 font-mono">
                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                    {profile.phone}
                                  </div>
                                )}
                                {profile.email && (
                                  <div className="flex items-center gap-1 font-mono">
                                    <Mail className="h-3 w-3 text-muted-foreground" />
                                    {profile.email}
                                  </div>
                                )}
                                {profile.address && (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                    {profile.address}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {contactEnrichment.sources && contactEnrichment.sources.length > 0 && (
                  <div className="text-xs text-muted-foreground pt-2">
                    Enriched via Freyja IQ's proprietary waterfall algorithm
                  </div>
                )}
              </CardContent>
            </Card>
            </HighlightOnUpdate>
          ) : (
            /* Show empty state when no contact data found */
            <Card data-testid="card-contact-enrichment-empty" role="region" aria-labelledby="contact-info-empty-heading">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle id="contact-info-empty-heading" className="text-base flex items-center gap-2">
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    Contact Information
                  </CardTitle>
                  <TargetedEnrichmentDropdown
                    entityId={ownerId!}
                    entityType={owner.type === "individual" ? "individual" : "entity"}
                    targets={["contacts"]}
                    onEnrichmentComplete={() => refetch()}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <p className="text-muted-foreground text-sm">
                    No contact information found for this owner in our data sources.
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}

          {melissaEnrichment && (
            <Card data-testid="card-melissa-enrichment" role="region" aria-labelledby="verification-heading">
              <CardHeader className="pb-3">
                <CardTitle id="verification-heading" className="text-base flex items-center gap-2">
                  <Home className="h-4 w-4" aria-hidden="true" />
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
            <HighlightOnUpdate updateKey={properties.length} className="rounded-md">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Properties
                    <span className="text-muted-foreground font-normal">({properties.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StaggerContainer className="space-y-3">
                    {properties.map((property) => (
                      <StaggerItem key={property.id}>
                        <PropertyCard
                          property={property}
                          compact
                          showOwnerLink={false}
                        />
                      </StaggerItem>
                    ))}
                  </StaggerContainer>
                </CardContent>
              </Card>
            </HighlightOnUpdate>
          )}

          <LlcNetwork owner={owner} linkedLlcs={linkedLlcs} />

          <FranchiseInfoCard
            propertyName={properties[0]?.address || null}
            ownerName={owner.name}
            ownerType={owner.type as "individual" | "entity"}
            headerAction={
              <TargetedEnrichmentDropdown
                entityId={ownerId!}
                entityType={owner.type as "individual" | "entity"}
                targets={["franchise"]}
                onEnrichmentComplete={() => refetch()}
              />
            }
          />

          <LegalEventsTimeline events={legalEvents} />
        </div>

        <div className="space-y-6">
          {owner.sellerIntentScore !== null &&
            owner.sellerIntentScore !== undefined && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    Seller Intent Score
                    <AIDisclosureBadge />
                  </CardTitle>
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


          {aiOutreach && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Outreach Suggestion
                  <AIDisclosureBadge />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AIDisclaimer className="mb-4" />
                <div className="relative">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {aiOutreach}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-0 right-0 min-h-[44px] min-w-[44px]"
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
