import { Store, Building, User, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  analyzeFranchise,
  type FranchiseAnalysis,
  type FranchiseOwnershipType,
} from "@shared/franchiseData";

interface FranchiseBadgeProps {
  ownershipType: FranchiseOwnershipType;
  brandName?: string;
  size?: "sm" | "default";
}

export function FranchiseBadge({
  ownershipType,
  brandName,
  size = "default",
}: FranchiseBadgeProps) {
  if (ownershipType === "corporate") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30 ${size === "sm" ? "text-xs" : ""}`}
            data-testid="badge-corporate"
          >
            <Building className={size === "sm" ? "h-3 w-3 mr-1" : "h-3.5 w-3.5 mr-1.5"} />
            Corporate
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Corporate-owned {brandName || "franchise"} location</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (ownershipType === "franchised") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 ${size === "sm" ? "text-xs" : ""}`}
            data-testid="badge-franchised"
          >
            <Store className={size === "sm" ? "h-3 w-3 mr-1" : "h-3.5 w-3.5 mr-1.5"} />
            Franchised
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Franchised {brandName || ""} location - owned by independent operator</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}

interface FranchiseInfoCardProps {
  propertyName: string | null;
  ownerName: string;
  ownerType: "individual" | "entity";
}

export function FranchiseInfoCard({
  propertyName,
  ownerName,
  ownerType,
}: FranchiseInfoCardProps) {
  const analysis = analyzeFranchise(propertyName, ownerName, ownerType);

  if (!analysis.isFranchise) {
    return null;
  }

  return (
    <Card data-testid="card-franchise-info">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Store className="h-4 w-4" />
          Franchise Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="secondary" className="font-medium">
            {analysis.brand?.name}
          </Badge>
          <FranchiseBadge
            ownershipType={analysis.ownershipType}
            brandName={analysis.brand?.name}
          />
          <Badge
            variant="outline"
            className="text-xs text-muted-foreground"
          >
            {analysis.brand?.category}
          </Badge>
        </div>

        <div className="text-sm space-y-2">
          <p className="text-muted-foreground">{analysis.explanation}</p>

          {analysis.brand?.parentCompany && (
            <div className="flex items-start gap-2 pt-2">
              <Building className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Parent Company</div>
                <div className="font-medium">{analysis.brand.parentCompany}</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground">
              Confidence: {analysis.confidence}
            </span>
          </div>
        </div>

        {analysis.ownershipType === "franchised" && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              This franchisee may be a good prospecting target. Franchise owners often have 
              multiple locations and may be interested in expanding or selling.
            </p>
          </div>
        )}

        {analysis.ownershipType === "corporate" && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Corporate-owned locations are managed by {analysis.brand?.parentCompany}. 
              Real estate decisions are typically made at the corporate level.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface FranchiseIndicatorProps {
  propertyName: string | null;
  ownerName: string;
  ownerType: "individual" | "entity";
  compact?: boolean;
}

export function FranchiseIndicator({
  propertyName,
  ownerName,
  ownerType,
  compact = false,
}: FranchiseIndicatorProps) {
  const analysis = analyzeFranchise(propertyName, ownerName, ownerType);

  if (!analysis.isFranchise) {
    return null;
  }

  if (compact) {
    return (
      <FranchiseBadge
        ownershipType={analysis.ownershipType}
        brandName={analysis.brand?.name}
        size="sm"
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="text-xs">
        {analysis.brand?.name}
      </Badge>
      <FranchiseBadge
        ownershipType={analysis.ownershipType}
        brandName={analysis.brand?.name}
        size="sm"
      />
    </div>
  );
}
