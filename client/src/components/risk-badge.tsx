import { AlertTriangle, Scale, CreditCard, FileWarning, Gavel } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RiskBadgeProps {
  type: string;
  className?: string;
}

const riskConfig: Record<string, { icon: typeof AlertTriangle; label: string; variant: "destructive" | "secondary" | "outline" }> = {
  litigation: { icon: Scale, label: "Litigation", variant: "destructive" },
  bankruptcy: { icon: FileWarning, label: "Bankruptcy", variant: "destructive" },
  tax_delinquent: { icon: CreditCard, label: "Tax Delinquent", variant: "destructive" },
  lien: { icon: Gavel, label: "Lien", variant: "secondary" },
  code_violation: { icon: AlertTriangle, label: "Code Violation", variant: "secondary" },
  judgment: { icon: Gavel, label: "Judgment", variant: "destructive" },
  eviction: { icon: AlertTriangle, label: "Eviction", variant: "secondary" },
};

export function RiskBadge({ type, className }: RiskBadgeProps) {
  const config = riskConfig[type.toLowerCase()] || {
    icon: AlertTriangle,
    label: type,
    variant: "secondary" as const,
  };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn("gap-1", className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

interface EntityTypeBadgeProps {
  type: "individual" | "entity" | string;
  className?: string;
  showLabel?: boolean;
}

import { Building2, User } from "lucide-react";

export function EntityTypeBadge({ type, className, showLabel = false }: EntityTypeBadgeProps) {
  const isEntity = type === "entity";
  const Icon = isEntity ? Building2 : User;
  
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-md",
        isEntity
          ? "text-blue-600 dark:text-blue-400"
          : "text-emerald-600 dark:text-emerald-400",
        showLabel ? "gap-1.5 px-2 py-1 bg-muted/50" : "h-6 w-6",
        className
      )}
      title={isEntity ? "LLC / Entity" : "Individual"}
    >
      <Icon className="h-4 w-4" />
      {showLabel && <span className="text-xs font-medium">{isEntity ? "Entity" : "Person"}</span>}
    </div>
  );
}
