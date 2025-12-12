import { useRoute, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  User,
  Home,
  MapPin,
  Phone,
  Mail,
  RefreshCw,
  Shield,
  AlertCircle,
  Users,
  GitBranch,
  ChevronRight,
  Clock,
  Database,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ScoreBadge } from "@/components/score-badge";
import { EntityTypeBadge, RiskBadge } from "@/components/risk-badge";

type EntityType = "individual" | "entity" | "property";
type EnrichmentStatus = "idle" | "pending" | "running" | "complete" | "failed" | "stale";

interface LinkedEntity {
  id: string;
  name: string;
  type: EntityType;
  relationship?: string;
  confidence?: number;
  route: string;
}

interface CoreSection {
  name: string;
  typeLabel: string;
  addresses: {
    primary?: string;
    mailing?: string;
    previous?: Array<{ address: string; city?: string; state?: string; zip?: string; timespan?: string }>;
  };
  identifiers: {
    apn?: string;
    ein?: string;
  };
  scoring: {
    sellerIntent?: number;
    contactConfidence?: number;
    riskFlags?: string[];
  };
  demographics?: {
    age?: number;
    birthDate?: string;
  };
  propertyDetails?: {
    propertyType?: string;
    sqFt?: number;
    units?: number;
    yearBuilt?: number;
    assessedValue?: number;
    marketValue?: number;
    lastSaleDate?: string;
    lastSalePrice?: number;
  };
}

interface ContactSection {
  primaryContacts: Array<{
    type: "phone" | "email";
    value: string;
    confidence?: number;
    source?: string;
    lineType?: string;
    isVerified?: boolean;
  }>;
  altContacts: Array<{
    type: "phone" | "email";
    value: string;
    confidence?: number;
    source?: string;
  }>;
  relatives?: Array<{ name: string; age?: number }>;
  associates?: Array<{ name: string; age?: number }>;
}

interface OwnershipSection {
  owners: LinkedEntity[];
  holdings: Array<{
    entity: LinkedEntity;
    properties: LinkedEntity[];
    relationship: string;
    confidence: number;
  }>;
  ultimateBeneficialOwners: LinkedEntity[];
  chain?: {
    levels: Array<{
      depth: number;
      entities: Array<{
        name: string;
        type: string;
        role?: string;
        confidence?: number;
      }>;
    }>;
  };
}

interface NetworkSection {
  linkedIndividuals: LinkedEntity[];
  relatedEntities: LinkedEntity[];
  relatedProperties: LinkedEntity[];
  legalEvents: Array<{
    id: string;
    type: string;
    status?: string;
    amount?: number;
    filedDate?: string;
    description?: string;
  }>;
}

interface MetaSection {
  lastUpdated?: string;
  enrichmentUpdatedAt?: string;
  providersUsed: string[];
  enrichmentStatus: EnrichmentStatus;
  enrichmentSource?: string;
}

interface UnifiedDossier {
  id: string;
  entityType: EntityType;
  core: CoreSection;
  contact: ContactSection;
  ownership: OwnershipSection;
  network: NetworkSection;
  meta: MetaSection;
}

function EntityIcon({ type }: { type: EntityType }) {
  switch (type) {
    case "individual":
      return <User className="h-4 w-4" />;
    case "entity":
      return <Building2 className="h-4 w-4" />;
    case "property":
      return <Home className="h-4 w-4" />;
  }
}

function EntityLink({ entity }: { entity: LinkedEntity }) {
  if (entity.route === "#") {
    return (
      <span className="text-muted-foreground flex items-center gap-1">
        <EntityIcon type={entity.type} />
        {entity.name}
      </span>
    );
  }

  return (
    <Link href={entity.route}>
      <span
        className="flex items-center gap-1 text-foreground hover:text-primary cursor-pointer hover-elevate rounded px-1 -mx-1"
        data-testid={`link-entity-${entity.id}`}
      >
        <EntityIcon type={entity.type} />
        <span className="underline underline-offset-2">{entity.name}</span>
        <ChevronRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

function EnrichmentStatusBadge({ status }: { status: EnrichmentStatus }) {
  const variants: Record<EnrichmentStatus, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    idle: { variant: "outline", label: "Not Enriched" },
    pending: { variant: "secondary", label: "Pending" },
    running: { variant: "default", label: "Running" },
    complete: { variant: "default", label: "Complete" },
    failed: { variant: "destructive", label: "Failed" },
    stale: { variant: "secondary", label: "Stale" },
  };

  const { variant, label } = variants[status] || variants.idle;

  return (
    <Badge variant={variant} className="text-xs" data-testid="badge-enrichment-status">
      {label}
    </Badge>
  );
}

function CoreInfoCard({ core, entityType }: { core: CoreSection; entityType: EntityType }) {
  return (
    <Card data-testid="card-core-info">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <EntityIcon type={entityType} />
          Core Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Type</div>
          <Badge variant="outline">{core.typeLabel}</Badge>
        </div>

        {core.addresses.primary && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Primary Address</div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span className="text-sm">{core.addresses.primary}</span>
            </div>
          </div>
        )}

        {core.addresses.mailing && core.addresses.mailing !== core.addresses.primary && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Mailing Address</div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <span className="text-sm">{core.addresses.mailing}</span>
            </div>
          </div>
        )}

        {core.identifiers.apn && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">APN</div>
            <span className="text-sm font-mono">{core.identifiers.apn}</span>
          </div>
        )}

        {core.demographics?.age && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Age</div>
            <span className="text-sm">{core.demographics.age} years old</span>
          </div>
        )}

        {core.scoring.sellerIntent !== undefined && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Seller Intent Score</div>
            <ScoreBadge score={core.scoring.sellerIntent} label="Intent" />
          </div>
        )}

        {core.scoring.riskFlags && core.scoring.riskFlags.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Risk Flags</div>
            <div className="flex flex-wrap gap-1">
              {core.scoring.riskFlags.map((flag, i) => (
                <RiskBadge key={i} type={flag} />
              ))}
            </div>
          </div>
        )}

        {core.propertyDetails && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            {core.propertyDetails.propertyType && (
              <div>
                <div className="text-xs text-muted-foreground">Type</div>
                <span className="text-sm">{core.propertyDetails.propertyType}</span>
              </div>
            )}
            {core.propertyDetails.sqFt && (
              <div>
                <div className="text-xs text-muted-foreground">Size</div>
                <span className="text-sm">{core.propertyDetails.sqFt.toLocaleString()} sqft</span>
              </div>
            )}
            {core.propertyDetails.yearBuilt && (
              <div>
                <div className="text-xs text-muted-foreground">Year Built</div>
                <span className="text-sm">{core.propertyDetails.yearBuilt}</span>
              </div>
            )}
            {core.propertyDetails.assessedValue && (
              <div>
                <div className="text-xs text-muted-foreground">Assessed Value</div>
                <span className="text-sm">${core.propertyDetails.assessedValue.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContactCard({ contact }: { contact: ContactSection }) {
  const allContacts = [...contact.primaryContacts, ...contact.altContacts];
  const phones = allContacts.filter((c) => c.type === "phone");
  const emails = allContacts.filter((c) => c.type === "email");

  if (allContacts.length === 0 && !contact.relatives?.length && !contact.associates?.length) {
    return (
      <Card data-testid="card-contact">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" />
            Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No contact information available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-contact">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="h-4 w-4" />
          Contact Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {phones.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Phone Numbers</div>
            <div className="space-y-2">
              {phones.map((phone, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-mono">{phone.value}</span>
                  </div>
                  {phone.confidence && <ScoreBadge score={phone.confidence} size="sm" showLabel={false} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {emails.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Email Addresses</div>
            <div className="space-y-2">
              {emails.map((email, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{email.value}</span>
                  </div>
                  {email.confidence && <ScoreBadge score={email.confidence} size="sm" showLabel={false} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {contact.relatives && contact.relatives.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Relatives</div>
            <div className="flex flex-wrap gap-2">
              {contact.relatives.slice(0, 5).map((rel, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {rel.name}
                  {rel.age && `, ${rel.age}`}
                </Badge>
              ))}
              {contact.relatives.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{contact.relatives.length - 5} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {contact.associates && contact.associates.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Associates</div>
            <div className="flex flex-wrap gap-2">
              {contact.associates.slice(0, 5).map((assoc, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {assoc.name}
                </Badge>
              ))}
              {contact.associates.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{contact.associates.length - 5} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OwnershipCard({ ownership, entityType }: { ownership: OwnershipSection; entityType: EntityType }) {
  const hasOwners = ownership.owners.length > 0;
  const hasHoldings = ownership.holdings.length > 0;
  const hasUbos = ownership.ultimateBeneficialOwners.length > 0;
  const hasChain = ownership.chain && ownership.chain.levels.length > 0;

  if (!hasOwners && !hasHoldings && !hasUbos && !hasChain) {
    return null;
  }

  return (
    <Card data-testid="card-ownership">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitBranch className="h-4 w-4" />
          Ownership
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasOwners && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Owners</div>
            <div className="space-y-2">
              {ownership.owners.map((owner) => (
                <EntityLink key={owner.id} entity={owner} />
              ))}
            </div>
          </div>
        )}

        {hasUbos && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Ultimate Beneficial Owners</div>
            <div className="space-y-2">
              {ownership.ultimateBeneficialOwners.map((ubo) => (
                <div key={ubo.id} className="flex items-center justify-between">
                  <EntityLink entity={ubo} />
                  {ubo.relationship && (
                    <Badge variant="outline" className="text-xs">
                      {ubo.relationship}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasHoldings && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Holdings</div>
            <div className="space-y-3">
              {ownership.holdings.map((holding, i) => (
                <div key={i} className="border rounded-md p-3 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <EntityLink entity={holding.entity} />
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {holding.relationship}
                      </Badge>
                      <ScoreBadge score={holding.confidence} size="sm" showLabel={false} />
                    </div>
                  </div>
                  {holding.properties.length > 0 && (
                    <div className="ml-4 space-y-1">
                      {holding.properties.slice(0, 3).map((prop) => (
                        <EntityLink key={prop.id} entity={prop} />
                      ))}
                      {holding.properties.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{holding.properties.length - 3} more properties
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasChain && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Ownership Chain</div>
            <div className="space-y-2 border-l-2 border-muted pl-4">
              {ownership.chain!.levels.map((level) => (
                <div key={level.depth}>
                  <div className="text-xs text-muted-foreground mb-1">Level {level.depth}</div>
                  <div className="flex flex-wrap gap-2">
                    {level.entities.map((entity, i) => (
                      <Badge key={i} variant={entity.type === "individual" ? "default" : "secondary"}>
                        {entity.name}
                        {entity.role && ` (${entity.role})`}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NetworkCard({ network }: { network: NetworkSection }) {
  const hasLinkedIndividuals = network.linkedIndividuals.length > 0;
  const hasRelatedEntities = network.relatedEntities.length > 0;
  const hasRelatedProperties = network.relatedProperties.length > 0;
  const hasLegalEvents = network.legalEvents.length > 0;

  if (!hasLinkedIndividuals && !hasRelatedEntities && !hasRelatedProperties && !hasLegalEvents) {
    return null;
  }

  return (
    <Card data-testid="card-network">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Network & Relationships
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasLinkedIndividuals && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Linked Individuals</div>
            <div className="space-y-2">
              {network.linkedIndividuals.map((individual) => (
                <div key={individual.id} className="flex items-center justify-between">
                  <EntityLink entity={individual} />
                  {individual.relationship && (
                    <Badge variant="outline" className="text-xs">
                      {individual.relationship}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasRelatedEntities && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Related Entities</div>
            <div className="space-y-2">
              {network.relatedEntities.map((entity) => (
                <div key={entity.id} className="flex items-center justify-between">
                  <EntityLink entity={entity} />
                  {entity.relationship && (
                    <Badge variant="outline" className="text-xs">
                      {entity.relationship}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasRelatedProperties && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Properties</div>
            <div className="space-y-2">
              {network.relatedProperties.slice(0, 5).map((prop) => (
                <EntityLink key={prop.id} entity={prop} />
              ))}
              {network.relatedProperties.length > 5 && (
                <span className="text-xs text-muted-foreground">
                  +{network.relatedProperties.length - 5} more properties
                </span>
              )}
            </div>
          </div>
        )}

        {hasLegalEvents && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Legal Events</div>
            <div className="space-y-2">
              {network.legalEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="capitalize">{event.type}</span>
                  </div>
                  {event.status && <Badge variant="outline">{event.status}</Badge>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetaCard({
  meta,
  onEnrich,
  isEnriching,
}: {
  meta: MetaSection;
  onEnrich: () => void;
  isEnriching: boolean;
}) {
  return (
    <Card data-testid="card-meta">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" />
          Enrichment Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <EnrichmentStatusBadge status={meta.enrichmentStatus} />
        </div>

        {meta.enrichmentSource && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Primary Source</span>
            <Badge variant="secondary" className="text-xs font-mono">
              {meta.enrichmentSource}
            </Badge>
          </div>
        )}

        {meta.providersUsed.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Providers Used</div>
            <div className="flex flex-wrap gap-1">
              {meta.providersUsed.map((provider, i) => (
                <Badge key={i} variant="outline" className="text-xs font-mono">
                  {provider}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {meta.lastUpdated && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Last updated: {new Date(meta.lastUpdated).toLocaleDateString()}
          </div>
        )}

        <Separator />

        <Button
          onClick={onEnrich}
          disabled={isEnriching}
          className="w-full"
          variant={meta.enrichmentStatus === "stale" || meta.enrichmentStatus === "idle" ? "default" : "outline"}
          data-testid="button-run-enrichment"
        >
          {isEnriching ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Running Enrichment...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Run Full Enrichment
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function UnifiedDossierPage() {
  const [, params] = useRoute("/dossier/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const id = params?.id;

  const {
    data: dossier,
    isLoading,
    error,
    refetch,
  } = useQuery<UnifiedDossier>({
    queryKey: ["/api/dossier", id],
    enabled: !!id,
  });

  const enrichMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dossier/${id}/enrich`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Enrichment Complete",
        description: `Used providers: ${data.providersUsed?.join(", ") || "None"}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dossier", id] });
    },
    onError: (error: Error) => {
      toast({
        title: "Enrichment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="dossier-loading">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !dossier) {
    return (
      <div className="p-6" data-testid="dossier-error">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Entity Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The requested entity could not be found or loaded.
            </p>
            <Button onClick={() => setLocation("/")}>Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6" data-testid="unified-dossier-page">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <EntityIcon type={dossier.entityType} />
            <h1 className="text-2xl font-bold" data-testid="dossier-title">
              {dossier.core.name}
            </h1>
            <EntityTypeBadge type={dossier.entityType === "entity" ? "entity" : dossier.entityType} />
          </div>
          <p className="text-muted-foreground text-sm mt-1">{dossier.core.typeLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <CoreInfoCard core={dossier.core} entityType={dossier.entityType} />
          <ContactCard contact={dossier.contact} />
          <OwnershipCard ownership={dossier.ownership} entityType={dossier.entityType} />
          <NetworkCard network={dossier.network} />
        </div>

        <div className="space-y-6">
          <MetaCard
            meta={dossier.meta}
            onEnrich={() => enrichMutation.mutate()}
            isEnriching={enrichMutation.isPending}
          />
        </div>
      </div>
    </div>
  );
}
