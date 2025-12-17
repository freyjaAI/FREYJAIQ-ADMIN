import { Badge } from "@/components/ui/badge";
import { Sparkles, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AIDisclosureBadgeProps {
  variant?: "inline" | "standalone";
  className?: string;
}

export function AIDisclosureBadge({ variant = "inline", className = "" }: AIDisclosureBadgeProps) {
  const badge = (
    <Badge 
      variant="outline" 
      className={`gap-1 text-xs font-normal border-ai/40 bg-ai/10 text-ai ${className}`}
      data-testid="badge-ai-generated"
    >
      <Sparkles className="h-3 w-3" />
      AI Generated
    </Badge>
  );

  if (variant === "standalone") {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badge}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs" data-testid="tooltip-ai-disclosure">
        <p className="text-sm">
          This content was generated using artificial intelligence. 
          AI-generated content may contain errors or inaccuracies and should be independently verified before taking action.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

interface AIDisclaimerProps {
  className?: string;
}

export function AIDisclaimer({ className = "" }: AIDisclaimerProps) {
  return (
    <div 
      className={`flex items-start gap-2 p-3 rounded-md bg-ai/5 border border-ai/20 text-sm ${className}`}
      data-testid="disclaimer-ai-content"
    >
      <Info className="h-4 w-4 text-ai mt-0.5 flex-shrink-0" />
      <div>
        <p className="font-medium text-ai">AI-Generated Content</p>
        <p className="text-muted-foreground mt-1">
          The following content was generated using artificial intelligence and is provided for informational purposes only. 
          Please verify this information independently before making any business decisions or communications.
        </p>
      </div>
    </div>
  );
}
