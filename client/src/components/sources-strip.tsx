import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, CheckCircle, Clock, Database } from "lucide-react";
import type { ProviderSource } from "@shared/schema";

interface SourcesStripProps {
  sources: ProviderSource[];
  onRetry?: (target: "contacts" | "ownership" | "property" | "franchise") => void;
  isRetrying?: boolean;
}

function getStatusIcon(status: ProviderSource["status"]) {
  switch (status) {
    case "success":
      return <CheckCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />;
    case "cached":
      return <Database className="h-3 w-3 text-sky-600 dark:text-sky-400" />;
    case "stale":
      return <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" />;
    case "fallback":
      return <Clock className="h-3 w-3 text-orange-600 dark:text-orange-400" />;
    case "error":
      return <AlertCircle className="h-3 w-3 text-destructive" />;
    default:
      return null;
  }
}

function getStatusVariant(status: ProviderSource["status"]): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "error":
      return "destructive";
    case "stale":
    case "fallback":
      return "secondary";
    default:
      return "outline";
  }
}

function getStatusTooltip(source: ProviderSource): string {
  const parts: string[] = [];
  
  switch (source.status) {
    case "success":
      parts.push("Data retrieved successfully");
      break;
    case "cached":
      parts.push("Using cached data");
      break;
    case "stale":
      parts.push("Data may be outdated");
      break;
    case "fallback":
      parts.push("Used as fallback source");
      break;
    case "error":
      parts.push(source.error || "Provider failed");
      break;
  }
  
  if (source.lastUpdated) {
    const date = new Date(source.lastUpdated);
    parts.push(`Last updated: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`);
  }
  
  if (source.canRetry && source.retryTarget && source.status === "error") {
    parts.push("Click retry to try again");
  }
  
  return parts.join("\n");
}

export function SourcesStrip({ sources, onRetry, isRetrying }: SourcesStripProps) {
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="sources-strip">
      <span className="text-xs text-muted-foreground font-medium">Sources:</span>
      {sources.map((source) => (
        <Tooltip key={source.name}>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center">
              <Badge
                variant={getStatusVariant(source.status)}
                className={`text-xs gap-1 cursor-default ${
                  source.status === "error" ? "border-destructive/50" : ""
                }`}
                data-testid={`source-chip-${source.name}`}
              >
                {getStatusIcon(source.status)}
                <span>{source.displayName}</span>
                {source.freshnessLabel && source.freshnessLabel !== "unknown" && (
                  <span className="text-muted-foreground">
                    {source.freshnessLabel}
                  </span>
                )}
              </Badge>
              {source.status === "error" && source.canRetry && onRetry && source.retryTarget && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 ml-1"
                  onClick={() => onRetry(source.retryTarget as "contacts" | "ownership" | "property" | "franchise")}
                  disabled={isRetrying}
                  data-testid={`retry-${source.name}`}
                >
                  <RefreshCw className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`} />
                </Button>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="text-xs whitespace-pre-line">
              {getStatusTooltip(source)}
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
