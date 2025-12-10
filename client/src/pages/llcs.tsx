import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Building, Search, Filter, ExternalLink, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Llc } from "@shared/schema";

interface OpenCorporatesResult {
  name: string;
  jurisdiction: string;
  registrationNumber: string;
  status: string;
  entityType: string;
  opencorporatesUrl: string;
}

const US_STATES = [
  { value: "all", label: "All States" },
  { value: "CA", label: "California" },
  { value: "TX", label: "Texas" },
  { value: "FL", label: "Florida" },
  { value: "NY", label: "New York" },
  { value: "DE", label: "Delaware" },
  { value: "NV", label: "Nevada" },
  { value: "WY", label: "Wyoming" },
  { value: "AZ", label: "Arizona" },
  { value: "CO", label: "Colorado" },
  { value: "GA", label: "Georgia" },
  { value: "IL", label: "Illinois" },
  { value: "NC", label: "North Carolina" },
  { value: "OH", label: "Ohio" },
  { value: "PA", label: "Pennsylvania" },
  { value: "WA", label: "Washington" },
];

export default function LLCsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<OpenCorporatesResult[] | null>(null);

  const { data: llcs, isLoading } = useQuery<Llc[]>({
    queryKey: ["/api/llcs"],
  });

  const searchMutation = useMutation({
    mutationFn: async ({ query, jurisdiction }: { query: string; jurisdiction?: string }) => {
      const params = new URLSearchParams({ query });
      if (jurisdiction && jurisdiction !== "all") {
        params.set("jurisdiction", jurisdiction);
      }
      const res = await apiRequest("GET", `/api/llcs/search?${params.toString()}`);
      return res.json();
    },
    onSuccess: (data) => {
      setSearchResults(data.results || []);
      setIsSearching(false);
    },
    onError: () => {
      setIsSearching(false);
    },
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    searchMutation.mutate({
      query: searchQuery,
      jurisdiction: stateFilter !== "all" ? stateFilter : undefined,
    });
  };

  const filteredLLCs = llcs?.filter((llc) => {
    const matchesSearch =
      !searchQuery ||
      llc.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState =
      stateFilter === "all" ||
      llc.jurisdiction?.toUpperCase() === stateFilter.toUpperCase();
    return matchesSearch && matchesState;
  });

  const getStatusColor = (status: string | null) => {
    if (!status) return "secondary";
    const s = status.toLowerCase();
    if (s.includes("active") || s.includes("good")) return "default";
    if (s.includes("inactive") || s.includes("dissolved")) return "destructive";
    return "secondary";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">LLCs</h1>
          <p className="text-muted-foreground">
            Search OpenCorporates for LLC and entity information, or browse previously searched entities.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search company name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
                data-testid="input-llc-search"
              />
            </div>
            <div className="flex gap-2">
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="w-40" data-testid="select-state-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map((state) => (
                    <SelectItem key={state.value} value={state.value}>
                      {state.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleSearch}
                disabled={!searchQuery.trim() || isSearching}
                data-testid="button-search-opencorporates"
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Search OpenCorporates
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {searchResults && searchResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium">OpenCorporates Results</h2>
            <Badge variant="secondary">{searchResults.length} found</Badge>
          </div>
          <div className="space-y-3">
            {searchResults.map((result, idx) => (
              <Card key={`${result.registrationNumber}-${idx}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Building className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{result.name}</span>
                        <Badge variant={getStatusColor(result.status)}>
                          {result.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <span>{result.jurisdiction}</span>
                        <span>{result.entityType}</span>
                        <span className="font-mono text-xs">{result.registrationNumber}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <a
                          href={result.opencorporatesUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`link-opencorporates-${idx}`}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View on OpenCorporates
                        </a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {searchResults && searchResults.length === 0 && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-center">
              <Building className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">No results found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                No companies matching "{searchQuery}" were found in OpenCorporates.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">Saved LLCs</h2>
          {filteredLLCs && <Badge variant="secondary">{filteredLLCs.length} entities</Badge>}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <Skeleton className="h-4 w-64" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredLLCs && filteredLLCs.length > 0 ? (
          <div className="space-y-3">
            {filteredLLCs.map((llc) => (
              <Card key={llc.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Building className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{llc.name}</span>
                        {llc.status && (
                          <Badge variant={getStatusColor(llc.status)}>
                            {llc.status}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        {llc.jurisdiction && <span>{llc.jurisdiction.toUpperCase()}</span>}
                        {llc.entityType && <span>{llc.entityType}</span>}
                        {llc.registrationNumber && (
                          <span className="font-mono text-xs">{llc.registrationNumber}</span>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/llcs/${llc.id}`} data-testid={`link-llc-dossier-${llc.id}`}>
                        View Dossier
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Building className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">No saved LLCs</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                  Search OpenCorporates above to find and save LLC information.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
