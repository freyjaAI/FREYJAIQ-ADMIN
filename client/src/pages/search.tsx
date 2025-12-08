import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, SearchX, Filter, SortAsc } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchBar } from "@/components/search-bar";
import { OwnerCard } from "@/components/owner-card";
import { PropertyCard } from "@/components/property-card";
import type { Owner, Property, ContactInfo } from "@shared/schema";

interface SearchResult {
  owners: (Owner & { properties?: Property[]; contacts?: ContactInfo[] })[];
  properties: Property[];
  total: number;
}

export default function SearchPage() {
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const initialQuery = params.get("q") || "";
  const initialType = params.get("type") || "address";

  const [currentQuery, setCurrentQuery] = useState(initialQuery);
  const [currentType, setCurrentType] = useState(initialType);
  const [sortBy, setSortBy] = useState("relevance");

  const {
    data: results,
    isLoading,
    isFetching,
  } = useQuery<SearchResult>({
    queryKey: ["/api/search", currentQuery, currentType],
    enabled: !!currentQuery,
  });

  const handleSearch = (query: string, type: string) => {
    setCurrentQuery(query);
    setCurrentType(type);
    window.history.replaceState(
      null,
      "",
      `/search?q=${encodeURIComponent(query)}&type=${type}`
    );
  };

  useEffect(() => {
    if (initialQuery && initialQuery !== currentQuery) {
      setCurrentQuery(initialQuery);
    }
  }, [initialQuery]);

  const hasResults =
    results && (results.owners.length > 0 || results.properties.length > 0);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Search</h1>
        <p className="text-muted-foreground">
          Find property owners, LLCs, and properties across the country.
        </p>
      </div>

      <Card>
        <CardContent className="py-6">
          <SearchBar onSearch={handleSearch} isLoading={isFetching} />
        </CardContent>
      </Card>

      {currentQuery && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Results for:</span>
            <Badge variant="secondary" className="font-medium">
              {currentQuery}
            </Badge>
            <Badge variant="outline">{currentType}</Badge>
            {results && (
              <span className="text-sm text-muted-foreground">
                ({results.total} found)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40" data-testid="select-sort">
                <SortAsc className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="score">Seller Intent</SelectItem>
                <SelectItem value="value">Property Value</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <Skeleton className="h-4 w-64" />
                  <div className="flex gap-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : currentQuery && !hasResults ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <SearchX className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No results found</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                We couldn't find any owners or properties matching "{currentQuery}".
                Try a different search term or search type.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : hasResults ? (
        <div className="space-y-6">
          {results.owners.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Owners</h2>
                <Badge variant="secondary">{results.owners.length}</Badge>
              </div>
              <div className="space-y-3">
                {results.owners.map((owner) => (
                  <OwnerCard
                    key={owner.id}
                    owner={owner}
                    properties={owner.properties}
                    contacts={owner.contacts}
                  />
                ))}
              </div>
            </div>
          )}

          {results.properties.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Properties</h2>
                <Badge variant="secondary">{results.properties.length}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {results.properties.map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Filter className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Start searching</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                Enter an address, owner name, or APN to find property owners and
                their contact information.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isFetching && !isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
