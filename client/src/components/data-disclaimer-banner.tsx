import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface DataDisclaimerBannerProps {
  variant?: "compact" | "full";
  dismissible?: boolean;
}

export function DataDisclaimerBanner({ variant = "compact", dismissible = true }: DataDisclaimerBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  if (variant === "compact") {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-md text-sm" data-testid="banner-data-disclaimer">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span className="text-muted-foreground">
            Data from public records and third-party sources. Verify accuracy before use.
          </span>
        </div>
        {dismissible && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 flex-shrink-0"
            onClick={() => setDismissed(true)}
            data-testid="button-dismiss-disclaimer"
          >
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-md" data-testid="banner-data-disclaimer-full">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-amber-600 dark:text-amber-400">Data Accuracy Notice</p>
          <p className="text-sm text-muted-foreground mt-1">
            Information displayed is sourced from public records and third-party data providers 
            including ATTOM, OpenCorporates, Data Axle, and others. Data may be outdated, incomplete, 
            or contain errors. Always verify information independently before taking any action.
          </p>
        </div>
        {dismissible && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="flex-shrink-0"
            onClick={() => setDismissed(true)}
            data-testid="button-dismiss-disclaimer-full"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface SourceBadgeProps {
  source: string;
  dataType: string;
  lastUpdated?: string;
}

export function SourceBadge({ source, dataType, lastUpdated }: SourceBadgeProps) {
  const sourceLabels: Record<string, string> = {
    attom: "ATTOM",
    opencorporates: "OpenCorporates",
    data_axle: "Data Axle",
    pacific_east: "Pacific East",
    melissa: "Melissa",
    apify: "Public Records",
    sec_edgar: "SEC EDGAR",
    home_harvest: "HomeHarvest",
    gemini: "AI Analysis",
    perplexity: "AI Research",
  };

  const label = sourceLabels[source.toLowerCase()] || source;

  return (
    <span 
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground"
      title={lastUpdated ? `Last updated: ${lastUpdated}` : undefined}
      data-testid={`badge-source-${source.toLowerCase()}`}
    >
      {dataType}: {label}
    </span>
  );
}
