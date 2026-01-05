import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";

interface ProviderHealthData {
  providerKey: string;
  displayName: string;
  status: "healthy" | "degraded" | "down";
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastSuccessAt: string | null;
  errorRateLastHour: number;
  errorCountLastHour: number;
  successCountLastHour: number;
  consecutiveFailures: number;
  updatedAt: string;
}

interface ProviderHealthResponse {
  providers: ProviderHealthData[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
  };
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "healthy":
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Healthy
        </Badge>
      );
    case "degraded":
      return (
        <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Degraded
        </Badge>
      );
    case "down":
      return (
        <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
          Down
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function SummaryCard({ 
  title, 
  value, 
  icon: Icon, 
  color 
}: { 
  title: string; 
  value: number; 
  icon: React.ElementType; 
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function AdminProviderHealthPage() {
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<ProviderHealthResponse>({
    queryKey: ["/api/admin/providers/health"],
    refetchInterval: 30000,
  });

  const resetMutation = useMutation({
    mutationFn: async (providerKey: string) => {
      return await apiRequest("POST", `/api/admin/providers/health/${providerKey}/reset`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers/health"] });
      toast({
        title: "Provider Reset",
        description: "Provider health has been reset to healthy.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset provider health",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Provider Health</h1>
            <p className="text-muted-foreground">Monitor external API provider status</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = data?.summary || { total: 0, healthy: 0, degraded: 0, down: 0 };
  const providers = data?.providers || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-provider-health">
            Provider Health
          </h1>
          <p className="text-muted-foreground">
            Monitor external API provider status and error rates
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          data-testid="button-refresh-health"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {summary.down > 0 && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="font-medium text-destructive">
                {summary.down} provider{summary.down > 1 ? "s" : ""} currently down
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {providers
                .filter((p) => p.status === "down")
                .map((p) => p.displayName)
                .join(", ")}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          title="Total Providers"
          value={summary.total}
          icon={Activity}
          color="text-muted-foreground"
        />
        <SummaryCard
          title="Healthy"
          value={summary.healthy}
          icon={CheckCircle2}
          color="text-green-600"
        />
        <SummaryCard
          title="Degraded"
          value={summary.degraded}
          icon={AlertTriangle}
          color="text-amber-500"
        />
        <SummaryCard
          title="Down"
          value={summary.down}
          icon={AlertCircle}
          color="text-destructive"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provider Status</CardTitle>
          <CardDescription>
            Real-time health status of all external API providers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Error Rate</TableHead>
                <TableHead className="text-right">Errors / Successes</TableHead>
                <TableHead>Last Error</TableHead>
                <TableHead>Last Success</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No providers configured
                  </TableCell>
                </TableRow>
              ) : (
                providers
                  .sort((a, b) => {
                    const statusOrder = { down: 0, degraded: 1, healthy: 2 };
                    return (statusOrder[a.status] || 2) - (statusOrder[b.status] || 2);
                  })
                  .map((provider) => (
                    <TableRow key={provider.providerKey} data-testid={`row-provider-${provider.providerKey}`}>
                      <TableCell className="font-medium">
                        {provider.displayName}
                        <div className="text-xs text-muted-foreground">
                          {provider.providerKey}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={provider.status} />
                        {provider.consecutiveFailures > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({provider.consecutiveFailures} consecutive)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            provider.errorRateLastHour > 0.5
                              ? "text-destructive font-medium"
                              : provider.errorRateLastHour > 0.2
                              ? "text-amber-500"
                              : "text-muted-foreground"
                          }
                        >
                          {(provider.errorRateLastHour * 100).toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-destructive">{provider.errorCountLastHour}</span>
                        {" / "}
                        <span className="text-green-600">{provider.successCountLastHour}</span>
                      </TableCell>
                      <TableCell>
                        {provider.lastErrorAt ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 cursor-help">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                <span className="text-sm">
                                  {formatDistanceToNow(new Date(provider.lastErrorAt), {
                                    addSuffix: true,
                                  })}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <p className="font-medium">Last Error Message:</p>
                              <p className="text-sm mt-1 break-words">
                                {provider.lastErrorMessage || "No message available"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground text-sm">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {provider.lastSuccessAt ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm">
                              {formatDistanceToNow(new Date(provider.lastSuccessAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {provider.status !== "healthy" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resetMutation.mutate(provider.providerKey)}
                            disabled={resetMutation.isPending}
                            data-testid={`button-reset-${provider.providerKey}`}
                          >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Reset
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
