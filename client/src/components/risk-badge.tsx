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
}

export function EntityTypeBadge({ type, className }: EntityTypeBadgeProps) {
  const isEntity = type === "entity";
  
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        isEntity
          ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
          : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
        className
      )}
    >
      {isEntity ? "LLC / Entity" : "Individual"}
    </Badge>
  );
}
