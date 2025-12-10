import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Building,
  ArrowLeft,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Users,
  FileText,
  Download,
  Loader2,
  RefreshCw,
  Calendar,
  Briefcase,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Llc } from "@shared/schema";

interface EnrichedOfficer {
  name: string;
  position: string;
  phones: Array<{ number: string; type: string }>;
  emails: Array<{ email: string; type: string }>;
  confidence: number;
}

interface LlcDossier extends Llc {
  officers: Array<{ name: string; position: string; startDate?: string }>;
  enrichedOfficers: EnrichedOfficer[];
}

export default function LlcDossierPage() {
  const [, params] = useRoute("/llcs/:id");
  const id = params?.id;
  const { toast } = useToast();

  const { data: dossier, isLoading, error, refetch } = useQuery<LlcDossier>({
    queryKey: ["/api/llcs", id, "dossier"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/llcs/${id}/dossier`);
      return res.json();
    },
    enabled: !!id,
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

  if (error || !dossier) {
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
          {dossier.opencorporatesUrl && (
            <Button variant="outline" asChild>
              <a
                href={dossier.opencorporatesUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-opencorporates-external"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                OpenCorporates
              </a>
            </Button>
          )}
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
            {dossier.registeredAddress && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Registered Address</p>
                <p className="text-sm">{dossier.registeredAddress}</p>
              </div>
            )}
            {dossier.principalAddress && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Principal Address</p>
                <p className="text-sm">{dossier.principalAddress}</p>
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
              {dossier.officers && (
                <Badge variant="secondary">
                  {dossier.officers.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dossier.enrichedOfficers && dossier.enrichedOfficers.length > 0 ? (
              <div className="space-y-4">
                {dossier.enrichedOfficers.map((officer, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-medium">{officer.name}</p>
                        <p className="text-sm text-muted-foreground">{officer.position}</p>
                      </div>
                      <Badge variant="outline">
                        {officer.confidence}% confidence
                      </Badge>
                    </div>
                    {(officer.phones.length > 0 || officer.emails.length > 0) && (
                      <div className="flex flex-col gap-1 pl-4 border-l-2 border-muted">
                        {officer.phones.map((phone, pIdx) => (
                          <a
                            key={pIdx}
                            href={`tel:${phone.number}`}
                            className="text-sm flex items-center gap-2 text-muted-foreground hover:text-foreground"
                          >
                            <Phone className="h-3 w-3" />
                            {phone.number}
                            <Badge variant="outline">
                              {phone.type}
                            </Badge>
                          </a>
                        ))}
                        {officer.emails.map((email, eIdx) => (
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
                    {idx < dossier.enrichedOfficers.length - 1 && <Separator />}
                  </div>
                ))}
              </div>
            ) : dossier.officers && dossier.officers.length > 0 ? (
              <div className="space-y-3">
                {dossier.officers.map((officer, idx) => (
                  <div key={idx}>
                    <p className="font-medium">{officer.name}</p>
                    <p className="text-sm text-muted-foreground">{officer.position}</p>
                  </div>
                ))}
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
