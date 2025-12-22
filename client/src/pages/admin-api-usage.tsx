import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Activity,
  Database,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Server,
  Zap,
  Clock,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Search,
} from "lucide-react";
import type { SearchHistory } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ProviderMetric {
  calls: number;
  cacheHits: number;
  cost: number;
  costSaved: number;
}

interface ProviderMetrics {
  providers: Record<string, ProviderMetric>;
  totals: {
    cost: number;
    costSaved: number;
    sessionStart: string;
  };
  cache: {
    llc: { hits: number; misses: number; hitRate: string };
    dossier: { hits: number; misses: number; hitRate: string };
    contact: { hits: number; misses: number; hitRate: string };
  };
  lastReset: string;
}

interface CacheStats {
  storage: {
    type: string;
    connected: boolean;
    keyCount?: number;
  };
  metrics: Record<string, {
    hits: number;
    misses: number;
    costSaved: number;
    lastReset: string;
    hitRate: number;
  }>;
  totals: {
    totalSaved: number;
    totalHits: number;
    totalMisses: number;
    overallHitRate: number;
  };
}

interface ApiUsage {
  providers: Record<string, {
    calls: number;
    records: number;
    lastCall?: string;
  }>;
  summary: {
    totalCalls: number;
    totalRecords: number;
    trackingStarted: string;
  };
  limits: Record<string, {
    totalQuota: number;
    dailyLimit: number;
    hourlyLimit: number;
  }>;
}

function MetricCard({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  trend 
}: { 
  title: string; 
  value: string | number; 
  description?: string; 
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderRow({ 
  name, 
  metric, 
  limit 
}: { 
  name: string; 
  metric: ProviderMetric;
  limit?: { totalQuota: number; dailyLimit: number };
}) {
  const calls = metric?.calls ?? 0;
  const cacheHits = metric?.cacheHits ?? 0;
  const usagePercent = limit ? (calls / limit.dailyLimit) * 100 : 0;
  const isWarning = usagePercent > 80;
  const isCritical = usagePercent > 95;

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${
          isCritical ? 'bg-red-500' : 
          isWarning ? 'bg-yellow-500' : 
          'bg-green-500'
        }`} />
        <div>
          <p className="font-medium capitalize">{name.replace(/_/g, ' ')}</p>
          <p className="text-xs text-muted-foreground">
            {calls} calls | {cacheHits} cache hits
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-mono text-sm">${(metric?.cost ?? 0).toFixed(2)}</p>
          <p className="text-xs text-green-500">-${(metric?.costSaved ?? 0).toFixed(2)}</p>
        </div>
        {limit && (
          <div className="w-24">
            <Progress value={Math.min(usagePercent, 100)} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {usagePercent.toFixed(0)}% of daily
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CacheMetricRow({ 
  provider, 
  data 
}: { 
  provider: string; 
  data: { hits: number; misses: number; costSaved: number; hitRate: number };
}) {
  const hits = data?.hits ?? 0;
  const misses = data?.misses ?? 0;
  
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <Database className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium capitalize">{provider.replace(/_/g, ' ')}</p>
          <p className="text-xs text-muted-foreground">
            {hits} hits | {misses} misses
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Badge variant={(data?.hitRate ?? 0) > 50 ? "default" : "secondary"}>
          {(data?.hitRate ?? 0).toFixed(1)}% hit rate
        </Badge>
        <p className="font-mono text-sm text-green-500">
          -${(data?.costSaved ?? 0).toFixed(2)}
        </p>
      </div>
    </div>
  );
}

export default function AdminApiUsagePage() {
  const { toast } = useToast();

  const { data: providerMetrics, isLoading: metricsLoading } = useQuery<ProviderMetrics>({
    queryKey: ['/api/admin/provider-metrics'],
    refetchInterval: 30000,
  });

  const { data: cacheStats, isLoading: cacheLoading } = useQuery<CacheStats>({
    queryKey: ['/api/admin/cache-stats'],
    refetchInterval: 30000,
  });

  const { data: apiUsage, isLoading: usageLoading } = useQuery<ApiUsage>({
    queryKey: ['/api/admin/api-usage'],
    refetchInterval: 30000,
  });

  const { data: dashboardStats } = useQuery<{ recentSearches: SearchHistory[] }>({
    queryKey: ['/api/dashboard/stats'],
    refetchInterval: 30000,
  });

  const resetCacheMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/cache-stats/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/cache-stats'] });
      toast({ title: "Cache metrics reset", description: "All cache statistics have been cleared." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset cache metrics.", variant: "destructive" });
    },
  });

  const resetUsageMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/api-usage/reset', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error('Failed to reset');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/api-usage'] });
      toast({ title: "Usage tracking reset", description: "All API usage statistics have been cleared." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset usage tracking.", variant: "destructive" });
    },
  });

  const isLoading = metricsLoading || cacheLoading || usageLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72 mt-2" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const totalCost = providerMetrics?.totals.cost || 0;
  const totalSaved = cacheStats?.totals.totalSaved || 0;
  const overallHitRate = cacheStats?.totals.overallHitRate || 0;
  const totalCalls = apiUsage?.summary.totalCalls || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            API Usage & Cost Tracking
          </h1>
          <p className="text-muted-foreground">
            Monitor provider costs, cache performance, and API quotas
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/admin/provider-metrics'] });
              queryClient.invalidateQueries({ queryKey: ['/api/admin/cache-stats'] });
              queryClient.invalidateQueries({ queryKey: ['/api/admin/api-usage'] });
            }}
            data-testid="button-refresh-stats"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Total API Cost"
          value={`$${totalCost.toFixed(2)}`}
          description="This session"
          icon={DollarSign}
        />
        <MetricCard
          title="Cost Saved"
          value={`$${totalSaved.toFixed(2)}`}
          description="Via caching"
          icon={TrendingUp}
        />
        <MetricCard
          title="Cache Hit Rate"
          value={`${overallHitRate.toFixed(1)}%`}
          description="Overall performance"
          icon={Zap}
        />
        <MetricCard
          title="Total API Calls"
          value={totalCalls.toLocaleString()}
          description="All providers"
          icon={Activity}
        />
      </div>

      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="providers" data-testid="tab-providers">
            <Server className="h-4 w-4 mr-2" />
            Providers
          </TabsTrigger>
          <TabsTrigger value="cache" data-testid="tab-cache">
            <Database className="h-4 w-4 mr-2" />
            Cache Stats
          </TabsTrigger>
          <TabsTrigger value="quotas" data-testid="tab-quotas">
            <BarChart3 className="h-4 w-4 mr-2" />
            Quotas
          </TabsTrigger>
          <TabsTrigger value="searches" data-testid="tab-searches">
            <Search className="h-4 w-4 mr-2" />
            Recent Searches
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Provider Costs</CardTitle>
              <CardDescription>
                Real-time cost tracking per data provider
              </CardDescription>
            </CardHeader>
            <CardContent>
              {providerMetrics?.providers && Object.entries(providerMetrics.providers).length > 0 ? (
                <div className="divide-y">
                  {Object.entries(providerMetrics.providers).map(([name, metric]) => (
                    <ProviderRow 
                      key={name} 
                      name={name} 
                      metric={metric}
                      limit={apiUsage?.limits[name]}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No provider activity recorded yet</p>
                  <p className="text-sm">Start searching to see cost tracking</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cache" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Cache Performance</CardTitle>
                <CardDescription>
                  Redis/memory cache hit rates and cost savings
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => resetCacheMutation.mutate()}
                disabled={resetCacheMutation.isPending}
                data-testid="button-reset-cache"
              >
                {resetCacheMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Reset Metrics
              </Button>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-3 rounded-lg bg-muted/50 flex items-center gap-3">
                {cacheStats?.storage.connected ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                )}
                <div>
                  <p className="font-medium">
                    {cacheStats?.storage.type === 'redis' ? 'Redis Cache' : 'In-Memory Cache'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {cacheStats?.storage.connected ? 'Connected' : 'Using fallback'}
                    {cacheStats?.storage.keyCount !== undefined && ` | ${cacheStats.storage.keyCount} keys`}
                  </p>
                </div>
              </div>

              {cacheStats?.metrics && Object.entries(cacheStats.metrics).length > 0 ? (
                <div className="divide-y">
                  {Object.entries(cacheStats.metrics).map(([provider, data]) => (
                    <CacheMetricRow key={provider} provider={provider} data={data} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No cache activity recorded yet</p>
                  <p className="text-sm">Cache metrics will appear after searches</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quotas" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>API Quotas & Limits</CardTitle>
                <CardDescription>
                  Usage tracking and quota enforcement
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => resetUsageMutation.mutate()}
                disabled={resetUsageMutation.isPending}
                data-testid="button-reset-usage"
              >
                {resetUsageMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Reset Tracking
              </Button>
            </CardHeader>
            <CardContent>
              {apiUsage?.providers && Object.entries(apiUsage.providers).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(apiUsage.providers).map(([provider, data]) => {
                    const limit = apiUsage.limits[provider];
                    const usagePercent = limit ? (data.calls / limit.dailyLimit) * 100 : 0;
                    
                    return (
                      <div key={provider} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium capitalize">{provider.replace(/_/g, ' ')}</span>
                            {usagePercent > 80 && (
                              <Badge variant="destructive" className="text-xs">
                                {usagePercent > 95 ? 'Critical' : 'Warning'}
                              </Badge>
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {data.calls} / {limit?.dailyLimit || '∞'} daily
                          </span>
                        </div>
                        {limit && (
                          <Progress value={Math.min(usagePercent, 100)} className="h-2" />
                        )}
                        {data.lastCall && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last call: {new Date(data.lastCall).toLocaleString()}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No API usage recorded yet</p>
                  <p className="text-sm">Usage will be tracked as you make searches</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="searches" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Search Costs</CardTitle>
              <CardDescription>
                Per-search cost breakdown showing estimated API costs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboardStats?.recentSearches && dashboardStats.recentSearches.length > 0 ? (
                <div className="divide-y">
                  {dashboardStats.recentSearches.map((search) => {
                    const queryText = typeof search.query === 'object' 
                      ? (search.query as any).q || JSON.stringify(search.query)
                      : String(search.query || '');
                    const providerCalls = search.providerCalls as Array<{ provider: string; calls: number; cacheHits: number; cost: number }> | null;
                    
                    return (
                      <div key={search.id} className="py-4" data-testid={`search-cost-row-${search.id}`}>
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{queryText}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Badge variant="secondary" className="text-xs">
                                {search.searchType}
                              </Badge>
                              <span>{search.resultCount ?? 0} results</span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(search.createdAt!).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-lg font-semibold text-amber-600 dark:text-amber-400" data-testid={`text-search-cost-${search.id}`}>
                              ${(search.estimatedCost ?? 0).toFixed(3)}
                            </p>
                          </div>
                        </div>
                        {providerCalls && providerCalls.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {providerCalls.map((pc, idx) => (
                              <Badge 
                                key={idx} 
                                variant="outline" 
                                className="text-xs font-mono"
                              >
                                {pc.provider}: {pc.calls} call{pc.calls !== 1 ? 's' : ''} 
                                {pc.cacheHits > 0 && ` (${pc.cacheHits} cached)`}
                                {pc.cost > 0 && ` = $${pc.cost.toFixed(3)}`}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No recent searches found</p>
                  <p className="text-sm">Search costs will appear here after you perform searches</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
