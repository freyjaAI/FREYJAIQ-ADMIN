import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, SearchX, Filter, SortAsc, ExternalLink, Database, Globe, Building, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FreyjaLoader } from "@/components/freyja-loader";
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
import { DataDisclaimerBanner } from "@/components/data-disclaimer-banner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Owner, Property, ContactInfo } from "@shared/schema";

interface SearchResult {
  owners: (Owner & { properties?: Property[]; contacts?: ContactInfo[] })[];
  properties: Property[];
  total: number;
}

interface ExternalSearchResult {
  properties: any[];
  llcs: any[];
  contacts: any[];
  sources: string[];
  total: number;
}

export default function SearchPage() {
  const searchParams = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const params = new URLSearchParams(searchParams);
  const initialQuery = params.get("q") || "";
  const initialType = params.get("type") || "address";
  
  // Person search params
  const initialPersonName = params.get("name") || "";
  const initialPersonAddress = params.get("address") || "";
  const initialPersonCity = params.get("city") || "";
  const initialPersonState = params.get("state") || "";

  const [currentQuery, setCurrentQuery] = useState(initialQuery);
  const [currentType, setCurrentType] = useState(initialType);
  const [currentUnit, setCurrentUnit] = useState(params.get("unit") || "");
  const [personData, setPersonData] = useState({
    name: initialPersonName,
    address: initialPersonAddress,
    city: initialPersonCity,
    state: initialPersonState,
  });
  const [sortBy, setSortBy] = useState("relevance");
  const [externalResults, setExternalResults] = useState<ExternalSearchResult | null>(null);

  // Local database search
  const {
    data: results,
    isLoading,
    isFetching,
  } = useQuery<SearchResult>({
    queryKey: ["/api/search", currentQuery, currentType],
    enabled: !!currentQuery,
  });

  // External data providers search
  const externalSearchMutation = useMutation({
    mutationFn: async ({ query, type, unit }: { query: string; type: string; unit?: string }) => {
      const res = await apiRequest("POST", "/api/search/external", { query, type, unit });
      return res.json() as Promise<ExternalSearchResult>;
    },
    onSuccess: (data) => {
      setExternalResults(data);
    },
    onError: (error) => {
      console.error("External search failed:", error);
    },
  });

  // Import property from external results
  const importPropertyMutation = useMutation({
    mutationFn: async (property: any) => {
      const res = await fetch("/api/properties/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property }),
        credentials: "include",
      });
      const data = await res.json();
      // Return both the data and status for proper handling
      return { data, status: res.status };
    },
    onSuccess: ({ data, status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      
      if (status === 409) {
        // Property already exists - navigate to the existing owner
        if (data.property?.ownerId) {
          setLocation(`/owners/${data.property.ownerId}`);
        }
      } else if (data.ownerId) {
        // New property created - navigate to owner dossier
        setLocation(`/owners/${data.ownerId}`);
      }
    },
    onError: (error: any) => {
      console.error("Import failed:", error);
    },
  });

  // Import LLC from external results
  const importLlcMutation = useMutation({
    mutationFn: async (llc: any) => {
      const res = await apiRequest("POST", "/api/llcs/import", {
        name: llc.name,
        jurisdiction: llc.jurisdiction || llc.jurisdictionCode,
        opencorporatesUrl: llc.opencorporatesUrl,
        registrationNumber: llc.companyNumber,
        status: llc.status,
        entityType: llc.entityType,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/llcs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      
      // Navigate to LLC dossier page
      if (data.llc?.id) {
        toast({
          title: data.existed ? "LLC Already Exists" : "LLC Imported",
          description: data.existed 
            ? `Opening existing dossier for ${data.llc.name}` 
            : `Successfully imported ${data.llc.name}. Click "Refresh Data" to enrich officers.`,
        });
        setLocation(`/llcs/${data.llc.id}`);
      }
    },
    onError: (error: any) => {
      console.error("LLC import failed:", error);
      toast({
        title: "Import Failed",
        description: "Could not import LLC. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSearch = (query: string, type: string, newPersonData?: { name: string; address: string; city: string; state: string }, unit?: string) => {
    setCurrentQuery(query);
    setCurrentType(type);
    setCurrentUnit(unit || "");
    setExternalResults(null);
    
    if (type === "person" && newPersonData) {
      setPersonData(newPersonData);
      const urlParams = new URLSearchParams({
        q: query,
        type,
        name: newPersonData.name,
        address: newPersonData.address,
        city: newPersonData.city,
        state: newPersonData.state,
      });
      window.history.replaceState(null, "", `/search?${urlParams.toString()}`);
      // Trigger external search with enhanced person data
      externalSearchMutation.mutate({ 
        query: `${newPersonData.name}${newPersonData.address ? ` ${newPersonData.address}` : ''}${newPersonData.city ? ` ${newPersonData.city}` : ''}${newPersonData.state ? ` ${newPersonData.state}` : ''}`.trim(), 
        type 
      });
    } else {
      // Build URL with optional unit
      const urlParams = new URLSearchParams({ q: query, type });
      if (unit) urlParams.set("unit", unit);
      window.history.replaceState(null, "", `/search?${urlParams.toString()}`);
      
      // Also trigger external search - pass unit separately for address searches
      externalSearchMutation.mutate({ query, type, unit: type === "address" ? unit : undefined });
    }
  };

  useEffect(() => {
    if (initialQuery && !externalSearchMutation.isPending) {
      setCurrentQuery(initialQuery);
      setCurrentType(initialType);
      setCurrentUnit(params.get("unit") || "");
      // Only trigger external search on page load if not already pending
      // This prevents duplicate requests when navigating back to search results
      externalSearchMutation.mutate({ 
        query: initialQuery, 
        type: initialType,
        unit: initialType === "address" ? (params.get("unit") || undefined) : undefined
      });
    }
  }, []);

  const hasLocalResults =
    results && (results.owners.length > 0 || results.properties.length > 0);
  
  const hasExternalResults =
    externalResults && externalResults.total > 0;
  
  const hasResults = hasLocalResults || hasExternalResults;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold">Search</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Find property owners, LLCs, and properties across the country.
        </p>
      </div>

      <Card>
        <CardContent className="py-6">
          <SearchBar onSearch={handleSearch} isLoading={isFetching} />
        </CardContent>
      </Card>

      {currentQuery && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs sm:text-sm text-muted-foreground">Results for:</span>
            <Badge variant="secondary" className="font-medium text-xs sm:text-sm max-w-[200px] truncate">
              {currentQuery}{currentUnit ? ` Unit ${currentUnit}` : ""}
            </Badge>
            <Badge variant="outline" className="text-xs sm:text-sm">{currentType}</Badge>
            {results && (
              <span className="text-xs sm:text-sm text-muted-foreground">
                ({results.total} found)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-40 min-h-[44px]" data-testid="select-sort">
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

      {isLoading || externalSearchMutation.isPending ? (
        <Card>
          <CardContent className="py-16">
            <FreyjaLoader 
              message={externalSearchMutation.isPending 
                ? "Enriching through proprietary FreyjaIQ waterfall" 
                : "Searching local database..."}
              submessage={externalSearchMutation.isPending 
                ? "Querying ATTOM, OpenCorporates, and data providers..." 
                : undefined}
              size="md"
            />
          </CardContent>
        </Card>
      ) : currentQuery && !hasResults && !externalSearchMutation.isPending ? (
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
          {/* Local database results */}
          {results && results.owners.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Saved Owners</h2>
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

          {results && results.properties.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Saved Properties</h2>
                <Badge variant="secondary">{results.properties.length}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {results.properties.map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
            </div>
          )}

          {/* External data provider results */}
          {externalSearchMutation.isPending && (
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-muted-foreground">Searching external data providers...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {externalResults && externalResults.properties.length > 0 && (
            <div className="space-y-4">
              <DataDisclaimerBanner variant="compact" />
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Property Records</h2>
                <Badge variant="secondary">{externalResults.properties.length}</Badge>
                {externalResults.sources.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    via {externalResults.sources.join(", ")}
                  </Badge>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {externalResults.properties.map((prop: any, idx: number) => (
                  <Card key={idx} className="hover-elevate">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-medium">{prop.address?.line1 || prop.address}</h3>
                          <p className="text-sm text-muted-foreground">
                            {prop.address?.city}, {prop.address?.state} {prop.address?.zip}
                          </p>
                        </div>
                        {prop.assessedValue && (
                          <Badge variant="outline">
                            ${(prop.assessedValue || 0).toLocaleString()}
                          </Badge>
                        )}
                      </div>
                      {prop.owner && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Owner: </span>
                          <span className="font-medium">{prop.owner}</span>
                        </div>
                      )}
                      {prop.propertyType && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Type: </span>
                          <span>{prop.propertyType}</span>
                        </div>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="w-full"
                        onClick={() => importPropertyMutation.mutate(prop)}
                        disabled={importPropertyMutation.isPending}
                        data-testid={`button-import-property-${idx}`}
                      >
                        {importPropertyMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Import Property
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {externalResults && externalResults.llcs.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Companies & LLCs</h2>
                <Badge variant="secondary">{externalResults.llcs.length}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {externalResults.llcs.map((llc: any, idx: number) => (
                  <Card key={idx} className="hover-elevate">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-medium">{llc.name}</h3>
                          {llc.jurisdiction && (
                            <p className="text-sm text-muted-foreground">
                              {llc.jurisdiction}
                            </p>
                          )}
                        </div>
                        {llc.status && (
                          <Badge variant={llc.status === "Active" ? "default" : "secondary"}>
                            {llc.status}
                          </Badge>
                        )}
                      </div>
                      {llc.entityType && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Type: </span>
                          <span>{llc.entityType}</span>
                        </div>
                      )}
                      {llc.companyNumber && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Reg #: </span>
                          <span className="font-mono">{llc.companyNumber}</span>
                        </div>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="w-full"
                        onClick={() => importLlcMutation.mutate(llc)}
                        disabled={importLlcMutation.isPending}
                        data-testid={`button-import-llc-${idx}`}
                      >
                        {importLlcMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Importing & Enriching...
                          </>
                        ) : (
                          <>
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Import to LLCs
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {externalResults && externalResults.contacts.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Contact Information</h2>
                <Badge variant="secondary">{externalResults.contacts.length}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {externalResults.contacts.map((contact: any, idx: number) => (
                  <Card key={idx} className="hover-elevate">
                    <CardContent className="p-4 space-y-2">
                      <h3 className="font-medium">{contact.name}</h3>
                      {contact.phone && (
                        <p className="text-sm">{contact.phone}</p>
                      )}
                      {contact.email && (
                        <p className="text-sm text-muted-foreground">{contact.email}</p>
                      )}
                    </CardContent>
                  </Card>
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
