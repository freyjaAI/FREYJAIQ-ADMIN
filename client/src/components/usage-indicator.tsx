import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface UsageData {
  firmName: string | null;
  tierName: string | null;
  firmCallsUsed: number;
  firmCallLimit: number | null;
  userCallsUsed: number;
  userCallLimit: number | null;
  period: string;
}

function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleString("default", { month: "long", year: "numeric" });
}

function getUsagePercentage(used: number, limit: number | null): number {
  if (!limit || limit === 0) return 0;
  return Math.min(100, (used / limit) * 100);
}

function isNearLimit(used: number, limit: number | null): boolean {
  if (!limit || limit === 0) return false;
  return used >= limit * 0.9;
}

function isAtLimit(used: number, limit: number | null): boolean {
  if (!limit || limit === 0) return false;
  return used >= limit;
}

export function UsageIndicator() {
  const { data, isLoading, error } = useQuery<UsageData>({
    queryKey: ["/api/me/usage"],
    refetchInterval: 60000,
  });

  if (isLoading || error || !data) {
    return null;
  }

  const firmPercent = getUsagePercentage(data.firmCallsUsed, data.firmCallLimit);
  const userPercent = getUsagePercentage(data.userCallsUsed, data.userCallLimit);
  const nearFirmLimit = isNearLimit(data.firmCallsUsed, data.firmCallLimit);
  const nearUserLimit = isNearLimit(data.userCallsUsed, data.userCallLimit);
  const atFirmLimit = isAtLimit(data.firmCallsUsed, data.firmCallLimit);
  const atUserLimit = isAtLimit(data.userCallsUsed, data.userCallLimit);
  const showWarning = nearFirmLimit || nearUserLimit;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          data-testid="button-usage-indicator"
        >
          <Activity className="h-4 w-4" />
          {showWarning && (
            <AlertTriangle className="h-3 w-3 text-amber-500" />
          )}
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {data.userCallsUsed}
            {data.userCallLimit ? `/${data.userCallLimit}` : ""}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-medium text-sm">Usage This Month</h4>
              <Badge variant="secondary" className="text-xs">
                {formatPeriod(data.period)}
              </Badge>
            </div>
            {data.firmName && (
              <p className="text-xs text-muted-foreground">
                {data.firmName} {data.tierName && `(${data.tierName})`}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span>Your searches</span>
                <span
                  className={atUserLimit ? "text-destructive font-medium" : ""}
                  data-testid="text-user-usage"
                >
                  {data.userCallsUsed}
                  {data.userCallLimit ? ` / ${data.userCallLimit}` : " (unlimited)"}
                </span>
              </div>
              {data.userCallLimit && (
                <Progress
                  value={userPercent}
                  className={`h-2 ${atUserLimit ? "[&>div]:bg-destructive" : nearUserLimit ? "[&>div]:bg-amber-500" : ""}`}
                  data-testid="progress-user-usage"
                />
              )}
            </div>

            {data.firmCallLimit !== null && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span>Firm searches</span>
                  <span
                    className={atFirmLimit ? "text-destructive font-medium" : ""}
                    data-testid="text-firm-usage"
                  >
                    {data.firmCallsUsed} / {data.firmCallLimit}
                  </span>
                </div>
                <Progress
                  value={firmPercent}
                  className={`h-2 ${atFirmLimit ? "[&>div]:bg-destructive" : nearFirmLimit ? "[&>div]:bg-amber-500" : ""}`}
                  data-testid="progress-firm-usage"
                />
              </div>
            )}
          </div>

          {(nearUserLimit || nearFirmLimit) && !atUserLimit && !atFirmLimit && (
            <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-warning-near-limit">
              You are approaching your monthly limit.
            </p>
          )}

          {(atUserLimit || atFirmLimit) && (
            <p className="text-xs text-destructive" data-testid="text-warning-at-limit">
              You have reached your monthly limit. Contact your administrator.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function UsageBanner() {
  const { data, isLoading, error } = useQuery<UsageData>({
    queryKey: ["/api/me/usage"],
    refetchInterval: 60000,
  });

  if (isLoading || error || !data) {
    return null;
  }

  const nearFirmLimit = isNearLimit(data.firmCallsUsed, data.firmCallLimit);
  const nearUserLimit = isNearLimit(data.userCallsUsed, data.userCallLimit);
  const atFirmLimit = isAtLimit(data.firmCallsUsed, data.firmCallLimit);
  const atUserLimit = isAtLimit(data.userCallsUsed, data.userCallLimit);

  if (!nearFirmLimit && !nearUserLimit) {
    return null;
  }

  const isAtAnyLimit = atFirmLimit || atUserLimit;

  return (
    <div
      className={`px-4 py-2 text-sm text-center ${
        isAtAnyLimit
          ? "bg-destructive/10 text-destructive border-b border-destructive/20"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-b border-amber-500/20"
      }`}
      data-testid="banner-usage-warning"
    >
      <div className="flex items-center justify-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        {isAtAnyLimit ? (
          <span>
            You have reached your monthly search limit.
            {atUserLimit && data.userCallLimit && ` (${data.userCallsUsed}/${data.userCallLimit} personal)`}
            {atFirmLimit && data.firmCallLimit && ` (${data.firmCallsUsed}/${data.firmCallLimit} firm)`}
          </span>
        ) : (
          <span>
            You are approaching your monthly limit.
            {nearUserLimit && data.userCallLimit && ` (${data.userCallsUsed}/${data.userCallLimit} personal)`}
            {nearFirmLimit && data.firmCallLimit && ` (${data.firmCallsUsed}/${data.firmCallLimit} firm)`}
          </span>
        )}
      </div>
    </div>
  );
}
