import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Users,
  Building2,
  FileText,
  Clock,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FreyjaLoader } from "@/components/freyja-loader";
import { StatCard } from "@/components/stat-card";
import { SearchBar } from "@/components/search-bar";
import { useAuth } from "@/hooks/useAuth";
import type { Owner, Property, SearchHistory } from "@shared/schema";

interface DashboardStats {
  totalOwners: number;
  totalProperties: number;
  dossiersGenerated: number;
  recentSearches: SearchHistory[];
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const navigate = setLocation;

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentOwners } = useQuery<Owner[]>({
    queryKey: ["/api/owners"],
  });

  const handleSearch = (query: string, type: string, personData?: { name: string; address: string; city: string; state: string }) => {
    if (type === "person" && personData) {
      const params = new URLSearchParams({
        q: query,
        type,
        name: personData.name,
        address: personData.address,
        city: personData.city,
        state: personData.state,
      });
      navigate(`/search?${params.toString()}`);
    } else {
      navigate(`/search?q=${encodeURIComponent(query)}&type=${type}`);
    }
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {greeting()}, {user?.firstName || "there"}
        </h1>
        <p className="body-dense text-muted-foreground">
          Find your next deal with powerful property intelligence.
        </p>
      </div>

      <Card className="bg-gradient-to-r from-primary/5 via-ai/5 to-ai-secondary/5 border-primary/20 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-10" />
        <CardContent className="py-8 relative z-10">
          <div className="max-w-2xl mx-auto">
            <h2 className="heading-3 text-center mb-4">
              Search Properties & Owners
            </h2>
            <SearchBar onSearch={handleSearch} size="large" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatCard
              title="Owners"
              value={stats?.totalOwners ?? 0}
              icon={Users}
              status={(stats?.totalOwners ?? 0) > 0 ? "positive" : "neutral"}
            />
            <StatCard
              title="Properties"
              value={stats?.totalProperties ?? 0}
              icon={Building2}
              status={(stats?.totalProperties ?? 0) > 0 ? "positive" : "neutral"}
            />
            <StatCard
              title="Dossiers"
              value={stats?.dossiersGenerated ?? 0}
              icon={FileText}
              status="neutral"
            />
            <StatCard
              title="Searches"
              value={stats?.recentSearches?.length ?? 0}
              icon={Search}
              status="neutral"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button
              variant="outline"
              className="justify-start gap-3 h-auto py-3"
              onClick={() => navigate("/search")}
              data-testid="button-quick-search"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                <Search className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <div className="font-medium">Property Search</div>
                <div className="text-xs text-muted-foreground">
                  Search by address, owner, or business
                </div>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-3 h-auto py-3"
              onClick={() => navigate("/owners")}
              data-testid="button-quick-owners"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <div className="font-medium">Browse Owners</div>
                <div className="text-xs text-muted-foreground">
                  View all owners in your database
                </div>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-3 h-auto py-3"
              onClick={() => navigate("/properties")}
              data-testid="button-quick-properties"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <div className="font-medium">Browse Properties</div>
                <div className="text-xs text-muted-foreground">
                  Explore property inventory
                </div>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {stats?.recentSearches && stats.recentSearches.length > 0 ? (
              <div className="space-y-3">
                {stats.recentSearches.slice(0, 5).map((search, i) => (
                  <div
                    key={search.id}
                    className="flex items-center gap-3 text-sm"
                    data-testid={`recent-search-${i}`}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                      <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {typeof search.query === "object"
                          ? JSON.stringify(search.query)
                          : String(search.query || "")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {search.searchType} search
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {search.resultCount ?? 0} results
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  No recent activity yet
                </p>
                <p className="text-xs text-muted-foreground">
                  Start by searching for a property or owner
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
