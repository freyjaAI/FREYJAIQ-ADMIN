import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle } from "lucide-react";

type StatStatus = "positive" | "warning" | "negative" | "neutral";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  status?: StatStatus;
  className?: string;
}

const statusConfig: Record<StatStatus, { iconColor: string; bgColor: string; textColor: string }> = {
  positive: {
    iconColor: "text-green-500",
    bgColor: "bg-green-500/10",
    textColor: "text-green-500",
  },
  warning: {
    iconColor: "text-amber-500",
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-500",
  },
  negative: {
    iconColor: "text-red-500",
    bgColor: "bg-red-500/10",
    textColor: "text-red-500",
  },
  neutral: {
    iconColor: "text-primary",
    bgColor: "bg-primary/10",
    textColor: "text-foreground",
  },
};

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  status = "neutral",
  className,
}: StatCardProps) {
  const config = statusConfig[status];

  return (
    <div className={cn("glass-card-static p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className={cn("text-4xl font-bold tracking-tight", config.textColor)}>
            {value}
          </div>
          <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
            {title}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">{description}</p>
          )}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-xs mt-2",
              trend.value >= 0 ? "text-green-500" : "text-red-500"
            )}>
              {trend.value >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>{trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", config.bgColor)}>
            <Icon className={cn("h-6 w-6", config.iconColor)} />
          </div>
        )}
      </div>
    </div>
  );
}

interface MiniStatProps {
  label: string;
  value: string | number;
  status?: StatStatus;
  icon?: LucideIcon;
}

export function MiniStat({ label, value, status = "neutral", icon: Icon }: MiniStatProps) {
  const config = statusConfig[status];
  
  return (
    <div className="flex items-center gap-3">
      {Icon && (
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", config.bgColor)}>
          <Icon className={cn("h-4 w-4", config.iconColor)} />
        </div>
      )}
      <div>
        <div className={cn("text-xl font-bold", config.textColor)}>{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

interface ProgressStatProps {
  label: string;
  value: number;
  max?: number;
  status?: StatStatus;
  showPercentage?: boolean;
}

export function ProgressStat({ label, value, max = 100, status = "neutral", showPercentage = true }: ProgressStatProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const config = statusConfig[status];
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium", config.textColor)}>
          {showPercentage ? `${Math.round(percentage)}%` : value}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div 
          className={cn("h-full rounded-full transition-all duration-500", 
            status === "positive" ? "bg-green-500" :
            status === "warning" ? "bg-amber-500" :
            status === "negative" ? "bg-red-500" :
            "bg-primary"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
