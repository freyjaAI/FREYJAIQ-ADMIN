import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  MoreVertical,
  RefreshCw,
  Users,
  Building2,
  Phone,
  Store,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type EnrichmentTarget = "contacts" | "ownership" | "franchise" | "property";

interface TargetedEnrichmentDropdownProps {
  entityId: string;
  entityType: "individual" | "entity";
  targets?: EnrichmentTarget[];
  variant?: "icon" | "button";
  onEnrichmentComplete?: () => void;
}

const TARGET_CONFIG: Record<
  EnrichmentTarget,
  {
    label: string;
    icon: typeof Users;
    endpoint: string;
    description: string;
  }
> = {
  contacts: {
    label: "Enrich Contacts",
    icon: Phone,
    endpoint: "enrich-contacts",
    description: "Find phone numbers and emails",
  },
  ownership: {
    label: "Enrich Ownership",
    icon: Building2,
    endpoint: "enrich-ownership",
    description: "Resolve LLC chain and principals",
  },
  franchise: {
    label: "Detect Franchise",
    icon: Store,
    endpoint: "enrich-franchise",
    description: "Identify corporate vs franchised",
  },
  property: {
    label: "Enrich Property",
    icon: Building2,
    endpoint: "enrich-property",
    description: "Get property details and valuation",
  },
};

export function TargetedEnrichmentDropdown({
  entityId,
  entityType,
  targets = ["contacts", "ownership", "franchise"],
  variant = "icon",
  onEnrichmentComplete,
}: TargetedEnrichmentDropdownProps) {
  const { toast } = useToast();
  const [activeTarget, setActiveTarget] = useState<EnrichmentTarget | null>(null);

  const enrichMutation = useMutation({
    mutationFn: async (target: EnrichmentTarget) => {
      const config = TARGET_CONFIG[target];
      const res = await apiRequest("POST", `/api/dossiers/${entityId}/${config.endpoint}`);
      return res.json();
    },
    onMutate: (target) => {
      setActiveTarget(target);
    },
    onSuccess: (data, target) => {
      const config = TARGET_CONFIG[target];
      
      toast({
        title: `${config.label} Complete`,
        description: data.message || `Successfully enriched ${target}`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/dossier", entityId] });
      queryClient.invalidateQueries({ queryKey: ["/api/owners", entityId] });
      queryClient.invalidateQueries({ queryKey: ["/api/owners", entityId, "dossier"] });

      if (onEnrichmentComplete) {
        onEnrichmentComplete();
      }
    },
    onError: (error: Error, target) => {
      const config = TARGET_CONFIG[target];
      toast({
        title: `${config.label} Failed`,
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setActiveTarget(null);
    },
  });

  const filteredTargets = targets.filter((target) => {
    if (target === "ownership" && entityType === "individual") {
      return false;
    }
    return true;
  });

  if (filteredTargets.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            disabled={enrichMutation.isPending}
            data-testid="button-targeted-enrichment"
          >
            {enrichMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <MoreVertical className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={enrichMutation.isPending}
            data-testid="button-targeted-enrichment"
          >
            {enrichMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Targeted Enrichment
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Targeted Enrichment
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {filteredTargets.map((target) => {
          const config = TARGET_CONFIG[target];
          const Icon = config.icon;
          const isActive = activeTarget === target;

          return (
            <DropdownMenuItem
              key={target}
              onClick={() => enrichMutation.mutate(target)}
              disabled={enrichMutation.isPending}
              className="flex items-center gap-2 cursor-pointer"
              data-testid={`menu-item-enrich-${target}`}
            >
              {isActive ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              <div className="flex flex-col">
                <span className="text-sm">{config.label}</span>
                <span className="text-xs text-muted-foreground">
                  {config.description}
                </span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
