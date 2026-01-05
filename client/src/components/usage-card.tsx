import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingUp, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

interface UsageData {
  firmName: string | null;
  tierName: string | null;
  firmCallsUsed: number;
  firmCallLimit: number | null;
  userCallsUsed: number;
  userCallLimit: number | null;
  period: string;
}

function getProgressColor(percentage: number): string {
  if (percentage >= 90) return "bg-destructive";
  if (percentage >= 70) return "bg-yellow-500";
  return "bg-green-500";
}

function getProgressClass(percentage: number): string {
  if (percentage >= 90) return "[&>div]:bg-destructive";
  if (percentage >= 70) return "[&>div]:bg-yellow-500";
  return "[&>div]:bg-green-500";
}

function formatResetDate(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const date = new Date(nextYear, nextMonth - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function UsageCard() {
  const { data: usage, isLoading, error } = useQuery<UsageData>({
    queryKey: ["/api/me/usage"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-usage-loading">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-2 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !usage) {
    return null;
  }

  const firmPercentage = usage.firmCallLimit 
    ? Math.min(100, (usage.firmCallsUsed / usage.firmCallLimit) * 100) 
    : 0;
  const userPercentage = usage.userCallLimit 
    ? Math.min(100, (usage.userCallsUsed / usage.userCallLimit) * 100) 
    : 0;

  const firmLimitReached = usage.firmCallLimit && usage.firmCallsUsed >= usage.firmCallLimit;
  const userLimitReached = usage.userCallLimit && usage.userCallsUsed >= usage.userCallLimit;
  const limitReached = firmLimitReached || userLimitReached;

  const firmWarning = usage.firmCallLimit && firmPercentage >= 90 && !firmLimitReached;
  const userWarning = usage.userCallLimit && userPercentage >= 90 && !userLimitReached;

  const resetDate = formatResetDate(usage.period);

  return (
    <Card data-testid="card-usage">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Usage This Month
        </CardTitle>
        {usage.tierName && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md" data-testid="text-tier-name">
            {usage.tierName}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {limitReached && (
          <Alert variant="destructive" data-testid="alert-limit-reached">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center gap-2">
              <span>Monthly limit reached.</span>
              <span className="flex items-center gap-1 text-xs">
                <Calendar className="h-3 w-3" />
                Resets {resetDate}
              </span>
            </AlertDescription>
          </Alert>
        )}

        {firmWarning && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10" data-testid="alert-firm-warning">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="text-yellow-700 dark:text-yellow-400">
              Your firm is approaching its monthly search limit. Contact admin to upgrade.
            </AlertDescription>
          </Alert>
        )}

        {userWarning && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10" data-testid="alert-user-warning">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="text-yellow-700 dark:text-yellow-400">
              You have used {Math.round(userPercentage)}% of your monthly searches. Pace your usage or contact your firm admin.
            </AlertDescription>
          </Alert>
        )}

        {usage.firmName && (
          <div className="space-y-2" data-testid="usage-firm">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{usage.firmName}</span>
              <span className="font-medium" data-testid="text-firm-usage">
                {usage.firmCallLimit 
                  ? `${usage.firmCallsUsed.toLocaleString()} / ${usage.firmCallLimit.toLocaleString()} searches`
                  : `${usage.firmCallsUsed.toLocaleString()} searches (unlimited)`
                }
              </span>
            </div>
            {usage.firmCallLimit && (
              <Progress 
                value={firmPercentage} 
                className={`h-2 ${getProgressClass(firmPercentage)}`}
                data-testid="progress-firm"
              />
            )}
          </div>
        )}

        <div className="space-y-2" data-testid="usage-user">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Your usage</span>
            <span className="font-medium" data-testid="text-user-usage">
              {usage.userCallLimit 
                ? `${usage.userCallsUsed.toLocaleString()} / ${usage.userCallLimit.toLocaleString()} searches`
                : `${usage.userCallsUsed.toLocaleString()} searches (unlimited)`
              }
            </span>
          </div>
          {usage.userCallLimit && (
            <Progress 
              value={userPercentage} 
              className={`h-2 ${getProgressClass(userPercentage)}`}
              data-testid="progress-user"
            />
          )}
        </div>

        {!limitReached && (usage.firmCallLimit || usage.userCallLimit) && (
          <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-reset-date">
            <Calendar className="h-3 w-3" />
            Resets {resetDate}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function useUsageLimits() {
  const { data: usage } = useQuery<UsageData>({
    queryKey: ["/api/me/usage"],
    refetchInterval: 60000,
  });

  const firmLimitReached = usage?.firmCallLimit && usage.firmCallsUsed >= usage.firmCallLimit;
  const userLimitReached = usage?.userCallLimit && usage.userCallsUsed >= usage.userCallLimit;
  const limitReached = firmLimitReached || userLimitReached;
  
  const resetDate = usage ? formatResetDate(usage.period) : null;

  return {
    limitReached,
    firmLimitReached,
    userLimitReached,
    resetDate,
    usage,
  };
}
