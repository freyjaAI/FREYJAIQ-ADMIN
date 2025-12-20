import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search, Filter, SortAsc, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FreyjaLoader } from "@/components/freyja-loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PropertyCard } from "@/components/property-card";
import type { Property } from "@shared/schema";

export default function PropertiesPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("address");

  const { data: properties, isLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const filteredProperties = properties
    ?.filter((property) => {
      const matchesSearch =
        !search ||
        property.address.toLowerCase().includes(search.toLowerCase()) ||
        property.city?.toLowerCase().includes(search.toLowerCase()) ||
        property.apn?.toLowerCase().includes(search.toLowerCase());
      const matchesType =
        typeFilter === "all" ||
        property.propertyType?.toLowerCase() === typeFilter;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "address":
          return a.address.localeCompare(b.address);
        case "value":
          return (b.marketValue ?? b.assessedValue ?? 0) - (a.marketValue ?? a.assessedValue ?? 0);
        case "date":
          return (
            new Date(b.lastSaleDate ?? 0).getTime() -
            new Date(a.lastSaleDate ?? 0).getTime()
          );
        default:
          return 0;
      }
    });

  const propertyTypes = [
    "all",
    ...Array.from(new Set(
      properties
        ?.map((p) => p.propertyType?.toLowerCase())
        .filter(Boolean) as string[]
    )),
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold">Properties</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Browse properties in your database and view ownership details.
        </p>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by address, city, or APN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-filter-properties"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="flex-1 sm:w-40 min-h-[44px]" data-testid="select-property-type">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {propertyTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === "all" ? "All Types" : type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="flex-1 sm:w-36 min-h-[44px]" data-testid="select-sort-properties">
                  <SortAsc className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="address">Address</SelectItem>
                  <SelectItem value="value">Value</SelectItem>
                  <SelectItem value="date">Sale Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-16">
            <FreyjaLoader 
              message="Enriching through proprietary FreyjaIQ waterfall" 
              submessage="Loading property records..."
              size="md"
            />
          </CardContent>
        </Card>
      ) : filteredProperties && filteredProperties.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{filteredProperties.length} properties</Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {filteredProperties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Building2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No properties found</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                {search || typeFilter !== "all"
                  ? "Try adjusting your filters or search term."
                  : "Start by searching for properties to add them to your database."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
