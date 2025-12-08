import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Search, Filter, SortAsc, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { OwnerCard } from "@/components/owner-card";
import type { Owner, Property, ContactInfo } from "@shared/schema";

interface OwnerWithRelations extends Owner {
  properties?: Property[];
  contacts?: ContactInfo[];
}

export default function OwnersPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");

  const { data: owners, isLoading } = useQuery<OwnerWithRelations[]>({
    queryKey: ["/api/owners"],
  });

  const filteredOwners = owners
    ?.filter((owner) => {
      const matchesSearch =
        !search ||
        owner.name.toLowerCase().includes(search.toLowerCase()) ||
        owner.primaryAddress?.toLowerCase().includes(search.toLowerCase());
      const matchesType =
        typeFilter === "all" || owner.type === typeFilter;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "score":
          return (b.sellerIntentScore ?? 0) - (a.sellerIntentScore ?? 0);
        case "properties":
          return (b.properties?.length ?? 0) - (a.properties?.length ?? 0);
        default:
          return 0;
      }
    });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Owners</h1>
          <p className="text-muted-foreground">
            Browse and manage property owners in your database.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search owners..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-filter-owners"
              />
            </div>
            <div className="flex gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-36" data-testid="select-type-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="entity">Entity/LLC</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-36" data-testid="select-sort-owners">
                  <SortAsc className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="score">Seller Intent</SelectItem>
                  <SelectItem value="properties">Properties</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
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
      ) : filteredOwners && filteredOwners.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{filteredOwners.length} owners</Badge>
          </div>
          <div className="space-y-3">
            {filteredOwners.map((owner) => (
              <OwnerCard
                key={owner.id}
                owner={owner}
                properties={owner.properties}
                contacts={owner.contacts}
              />
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No owners found</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                {search || typeFilter !== "all"
                  ? "Try adjusting your filters or search term."
                  : "Start by searching for properties or owners to add them to your database."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
