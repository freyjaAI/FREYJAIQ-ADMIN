import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Zap,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  SkipForward,
  Loader2,
  Building2,
  User,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  EnrichmentStepId,
  EnrichmentStepStatus,
  EnrichmentStepStatusValue,
} from "@shared/schema";
import { ENRICHMENT_STEP_LABELS, ENRICHMENT_STEP_ORDER } from "@shared/schema";

type EntityType = "individual" | "entity" | "property";

interface EnrichmentChangeSummary {
  newContacts: number;
  newPhones?: number;
  newEmails?: number;
  newPrincipals: number;
  newProperties: number;
  llcChainResolved: boolean;
  franchiseDetected: boolean;
  franchiseType?: "corporate" | "franchised";
  aiSummaryGenerated: boolean;
  addressValidated: boolean;
  estimatedCost?: number;
}

interface PhasedEnrichmentResponse {
  steps: EnrichmentStepStatus[];
  summary: EnrichmentChangeSummary;
  providersUsed: string[];
  overallStatus: "complete" | "partial" | "failed";
  durationMs: number;
  dossier: any;
}

interface EnrichmentPipelineBarProps {
  entityId: string;
  entityName: string;
  entityType: EntityType;
  onEnrichmentComplete?: (data: PhasedEnrichmentResponse) => void;
}

function EntityIcon({ type }: { type: EntityType }) {
  switch (type) {
    case "entity":
      return <Building2 className="h-4 w-4" />;
    case "property":
      return <Home className="h-4 w-4" />;
    default:
      return <User className="h-4 w-4" />;
  }
}

function getEntityTypeLabel(type: EntityType): string {
  switch (type) {
    case "entity":
      return "LLC / Entity";
    case "property":
      return "Property";
    default:
      return "Owner";
  }
}

function getStatusLabel(status: EnrichmentStepStatusValue): string {
  switch (status) {
    case "idle": return "pending";
    case "running": return "in progress";
    case "done": return "completed";
    case "error": return "failed";
    case "skipped": return "skipped";
    default: return status;
  }
}

function StepChip({
  step,
  isActive,
  index,
  total,
}: {
  step: EnrichmentStepStatus;
  isActive: boolean;
  index: number;
  total: number;
}) {
  const statusConfig: Record<
    EnrichmentStepStatusValue,
    {
      icon: typeof CheckCircle;
      bgClass: string;
      textClass: string;
      animate?: boolean;
    }
  > = {
    idle: {
      icon: Clock,
      bgClass: "bg-muted",
      textClass: "text-muted-foreground",
    },
    running: {
      icon: Loader2,
      bgClass: "bg-primary/20",
      textClass: "text-primary",
      animate: true,
    },
    done: {
      icon: CheckCircle,
      bgClass: "bg-green-500/20 dark:bg-green-500/30",
      textClass: "text-green-700 dark:text-green-400",
    },
    error: {
      icon: AlertCircle,
      bgClass: "bg-destructive/20",
      textClass: "text-destructive",
    },
    skipped: {
      icon: SkipForward,
      bgClass: "bg-muted/50",
      textClass: "text-muted-foreground/70",
    },
  };

  const config = statusConfig[step.status];
  const Icon = config.icon;
  const statusLabel = getStatusLabel(step.status);

  return (
    <div
      role="listitem"
      aria-label={`Step ${index + 1} of ${total}: ${step.label}, ${statusLabel}`}
      aria-current={isActive ? "step" : undefined}
      className={`
        flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
        transition-all duration-300 ease-in-out
        ${config.bgClass} ${config.textClass}
        ${isActive ? "ring-2 ring-primary ring-offset-1" : ""}
      `}
      title={step.error || step.label}
      data-testid={`chip-step-${step.id}`}
    >
      <Icon
        className={`h-3 w-3 ${config.animate ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span className="hidden sm:inline">{step.label}</span>
      <span className="sm:hidden">{step.id.slice(0, 3)}</span>
    </div>
  );
}

function formatSummary(summary: EnrichmentChangeSummary): string {
  const parts: string[] = [];

  // Show detailed phone/email counts if available, otherwise fall back to newContacts
  if (summary.newPhones !== undefined && summary.newEmails !== undefined) {
    if (summary.newPhones > 0 || summary.newEmails > 0) {
      const contactParts: string[] = [];
      if (summary.newPhones > 0) contactParts.push(`${summary.newPhones} phone${summary.newPhones > 1 ? "s" : ""}`);
      if (summary.newEmails > 0) contactParts.push(`${summary.newEmails} email${summary.newEmails > 1 ? "s" : ""}`);
      parts.push(contactParts.join(", "));
    }
  } else if (summary.newContacts > 0) {
    parts.push(`${summary.newContacts} new contact${summary.newContacts > 1 ? "s" : ""}`);
  }
  
  if (summary.newPrincipals > 0) {
    parts.push(`${summary.newPrincipals} principal${summary.newPrincipals > 1 ? "s" : ""} discovered`);
  }
  if (summary.newProperties > 0) {
    parts.push(`${summary.newProperties} propert${summary.newProperties > 1 ? "ies" : "y"} found`);
  }
  if (summary.llcChainResolved) {
    parts.push("LLC chain resolved");
  }
  if (summary.addressValidated) {
    parts.push("address validated");
  }

  if (parts.length === 0) {
    return "No new data found";
  }

  let result = parts.join(", ");
  
  // Add estimated cost if available
  if (summary.estimatedCost && summary.estimatedCost > 0) {
    result += ` (~$${summary.estimatedCost.toFixed(3)})`;
  }

  return result;
}

export function EnrichmentPipelineBar({
  entityId,
  entityName,
  entityType,
  onEnrichmentComplete,
}: EnrichmentPipelineBarProps) {
  const { toast } = useToast();
  const [steps, setSteps] = useState<EnrichmentStepStatus[]>(
    ENRICHMENT_STEP_ORDER.map((id) => ({
      id,
      label: ENRICHMENT_STEP_LABELS[id],
      status: "idle" as const,
    }))
  );
  const [hasRun, setHasRun] = useState(false);

  const enrichMutation = useMutation({
    mutationFn: async (): Promise<PhasedEnrichmentResponse> => {
      const res = await apiRequest("POST", `/api/dossiers/${entityId}/enrich-full`);
      return res.json();
    },
    onMutate: () => {
      setHasRun(true);
      setSteps((prev) =>
        prev.map((s, i) => ({
          ...s,
          status: i === 0 ? "running" : "idle",
        }))
      );

      let currentStep = 0;
      const interval = setInterval(() => {
        currentStep++;
        if (currentStep < ENRICHMENT_STEP_ORDER.length) {
          setSteps((prev) =>
            prev.map((s, i) => ({
              ...s,
              status: i < currentStep ? "done" : i === currentStep ? "running" : s.status,
            }))
          );
        } else {
          clearInterval(interval);
        }
      }, 800);

      return { interval };
    },
    onSuccess: (data) => {
      setSteps(data.steps);

      const statusMessage =
        data.overallStatus === "complete"
          ? "Enrichment complete"
          : data.overallStatus === "partial"
          ? "Enrichment partially complete"
          : "Enrichment failed";

      toast({
        title: statusMessage,
        description: formatSummary(data.summary),
        variant: data.overallStatus === "failed" ? "destructive" : "default",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/dossier", entityId] });
      queryClient.invalidateQueries({ queryKey: ["/api/owners", entityId] });

      if (onEnrichmentComplete) {
        onEnrichmentComplete(data);
      }
    },
    onError: (error: Error) => {
      setSteps((prev) =>
        prev.map((s) => ({
          ...s,
          status: s.status === "running" ? "error" : s.status,
          error: s.status === "running" ? error.message : undefined,
        }))
      );

      toast({
        title: "Enrichment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const activeStepIndex = steps.findIndex((s) => s.status === "running");

  const completedCount = steps.filter(s => s.status === "done").length;
  const progressLabel = enrichMutation.isPending 
    ? `Enrichment in progress, ${completedCount} of ${steps.length} steps completed`
    : hasRun
    ? `Enrichment ${enrichMutation.data?.overallStatus || "complete"}, ${completedCount} of ${steps.length} steps completed`
    : "Enrichment pipeline ready";

  return (
    <section
      aria-label="Enrichment Pipeline"
      aria-describedby="enrichment-status"
      className="flex flex-col gap-3 p-4 bg-card border rounded-lg"
      data-testid="enrichment-pipeline-bar"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <EntityIcon type={entityType} />
            <span className="font-medium truncate max-w-[200px] sm:max-w-none">
              {entityName}
            </span>
          </div>
          <Badge variant="outline" className="text-xs">
            {getEntityTypeLabel(entityType)}
          </Badge>
        </div>

        <Button
          onClick={() => enrichMutation.mutate()}
          disabled={enrichMutation.isPending}
          aria-label={enrichMutation.isPending 
            ? `Enriching ${entityName}, please wait` 
            : `Run full enrichment for ${entityName}`}
          aria-busy={enrichMutation.isPending}
          data-testid="button-run-full-enrichment"
        >
          {enrichMutation.isPending ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              Enriching...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" aria-hidden="true" />
              Run Full Enrichment
            </>
          )}
        </Button>
      </div>

      <div 
        role="list" 
        aria-label="Enrichment pipeline steps"
        className="flex flex-wrap items-center gap-2"
      >
        {steps.map((step, index) => (
          <StepChip
            key={step.id}
            step={step}
            isActive={index === activeStepIndex}
            index={index}
            total={steps.length}
          />
        ))}
      </div>
      
      <div id="enrichment-status" className="sr-only" aria-live="polite">
        {progressLabel}
      </div>

      {hasRun && !enrichMutation.isPending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {enrichMutation.data?.overallStatus === "complete" && (
            <>
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span>
                Completed in {((enrichMutation.data?.durationMs || 0) / 1000).toFixed(1)}s
                {enrichMutation.data?.providersUsed?.length > 0 && (
                  <> using {enrichMutation.data.providersUsed.join(", ")}</>
                )}
              </span>
            </>
          )}
          {enrichMutation.data?.overallStatus === "partial" && (
            <>
              <AlertCircle className="h-3 w-3 text-amber-500" />
              <span>
                Partially completed - some steps had errors
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
