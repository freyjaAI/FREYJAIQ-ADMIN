import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Clock,
  CheckCircle,
  AlertTriangle,
  Zap,
  Database,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface EnrichmentStatusCardProps {
  enrichmentUpdatedAt?: Date | string | null;
  enrichmentSource?: string | null;
  onReEnrich: () => void;
  isReEnriching: boolean;
  entityName: string;
  entityType: "individual" | "entity" | "property";
}

function getProviderDisplayName(source: string | null | undefined): string {
  if (!source) return "Unknown";
  const names: Record<string, string> = {
    apify_skip_trace: "Apify Skip Trace",
    apify: "Apify",
    data_axle: "Data Axle",
    dataaxle: "Data Axle",
    pacific_east: "Pacific East",
    pacificeast: "Pacific East",
    a_leads: "A-Leads",
    aleads: "A-Leads",
    opencorporates: "OpenCorporates",
    attom: "ATTOM",
    melissa: "Melissa",
    gemini: "Gemini AI",
    perplexity: "Perplexity AI",
  };
  return names[source.toLowerCase()] || source;
}

function getEnrichmentAge(updatedAt: Date | string | null | undefined): {
  label: string;
  isStale: boolean;
  isVeryStale: boolean;
  daysAgo: number;
  neverEnriched: boolean;
} {
  if (!updatedAt) {
    // Never enriched - not stale, just needs initial enrichment
    return { label: "Not yet enriched", isStale: false, isVeryStale: false, daysAgo: -1, neverEnriched: true };
  }

  const date = new Date(updatedAt);
  
  // Guard against invalid dates
  if (isNaN(date.getTime())) {
    return { label: "Unknown", isStale: false, isVeryStale: false, daysAgo: -1, neverEnriched: true };
  }
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  let label: string;
  if (diffMinutes < 60) {
    label = diffMinutes <= 1 ? "Just now" : `${diffMinutes} minutes ago`;
  } else if (diffHours < 24) {
    label = diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  } else if (diffDays === 1) {
    label = "Yesterday";
  } else if (diffDays < 7) {
    label = `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    label = weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  } else {
    const months = Math.floor(diffDays / 30);
    label = months === 1 ? "1 month ago" : `${months} months ago`;
  }

  return {
    label,
    isStale: diffDays >= 7,
    isVeryStale: diffDays >= 30,
    daysAgo: diffDays,
    neverEnriched: false,
  };
}

export function EnrichmentStatusCard({
  enrichmentUpdatedAt,
  enrichmentSource,
  onReEnrich,
  isReEnriching,
  entityName,
  entityType,
}: EnrichmentStatusCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const ageInfo = getEnrichmentAge(enrichmentUpdatedAt);
  const providerName = getProviderDisplayName(enrichmentSource);

  const handleReEnrich = () => {
    setDialogOpen(false);
    onReEnrich();
  };

  return (
    <Card className="border-dashed" data-testid="enrichment-status-card">
      <CardContent className="py-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {ageInfo.neverEnriched ? (
                <Database className="h-4 w-4 text-muted-foreground" />
              ) : ageInfo.isVeryStale ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : ageInfo.isStale ? (
                <Clock className="h-4 w-4 text-amber-500" />
              ) : (
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              )}
              <div className="flex flex-col">
                <span className="text-sm font-medium">Enrichment Status</span>
                <span className="text-xs text-muted-foreground">
                  {ageInfo.label}
                  {enrichmentUpdatedAt && (
                    <span className="ml-1">
                      ({new Date(enrichmentUpdatedAt).toLocaleDateString()})
                    </span>
                  )}
                </span>
              </div>
            </div>

            {enrichmentSource && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs gap-1">
                    <Database className="h-3 w-3" />
                    {providerName}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Primary data source for contact enrichment</p>
                </TooltipContent>
              </Tooltip>
            )}

            {ageInfo.isVeryStale && (
              <Badge variant="destructive" className="text-xs">
                Data may be outdated
              </Badge>
            )}
            {ageInfo.isStale && !ageInfo.isVeryStale && (
              <Badge variant="secondary" className="text-xs">
                Consider refreshing
              </Badge>
            )}
          </div>

          <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant={ageInfo.neverEnriched ? "default" : ageInfo.isStale ? "default" : "outline"}
                size="sm"
                disabled={isReEnriching}
                data-testid="button-re-enrich"
              >
                {isReEnriching ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Enriching...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    {ageInfo.neverEnriched ? "Enrich Now" : "Re-Enrich"}
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {ageInfo.neverEnriched ? "Enrich" : "Re-Enrich"} {entityType === "entity" ? "Entity" : entityType === "property" ? "Property" : "Individual"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will fetch {ageInfo.neverEnriched ? "" : "fresh "}data from all enrichment providers for <strong>{entityName}</strong>.
                  {!ageInfo.neverEnriched && ageInfo.daysAgo >= 0 && (
                    <span className="block mt-2 text-muted-foreground">
                      Last enriched: {ageInfo.label}
                    </span>
                  )}
                  <span className="block mt-2 text-amber-600 dark:text-amber-400">
                    Note: This may incur API usage costs based on your subscription tier.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReEnrich} data-testid="button-confirm-re-enrich">
                  <Zap className="h-4 w-4 mr-1" />
                  {ageInfo.neverEnriched ? "Enrich Now" : "Re-Enrich Now"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
