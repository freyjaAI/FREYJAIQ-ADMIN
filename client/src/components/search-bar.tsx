import { useState } from "react";
import { Search, X, Building2, User, Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

type SearchType = "address" | "owner" | "apn";

interface SearchBarProps {
  onSearch: (query: string, type: SearchType) => void;
  isLoading?: boolean;
  className?: string;
  placeholder?: string;
  size?: "default" | "large";
}

export function SearchBar({
  onSearch,
  isLoading = false,
  className,
  placeholder,
  size = "default",
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("address");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), searchType);
    }
  };

  const getPlaceholder = () => {
    if (placeholder) return placeholder;
    switch (searchType) {
      case "address":
        return "Search by property address...";
      case "owner":
        return "Search by owner name or LLC...";
      case "apn":
        return "Search by APN / Parcel ID...";
      default:
        return "Search...";
    }
  };

  const searchTypeConfig = [
    { value: "address", icon: Building2, label: "Address" },
    { value: "owner", icon: User, label: "Owner" },
    { value: "apn", icon: Hash, label: "APN" },
  ];

  return (
    <div className={cn("w-full space-y-3", className)}>
      <form onSubmit={handleSubmit} className="relative">
        <Search
          className={cn(
            "absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground",
            size === "large" ? "h-5 w-5" : "h-4 w-4"
          )}
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={getPlaceholder()}
          className={cn(
            "pl-11 pr-20",
            size === "large" && "h-14 text-lg"
          )}
          data-testid="input-search"
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "absolute right-14 top-1/2 -translate-y-1/2",
              size === "large" && "right-16"
            )}
            onClick={() => setQuery("")}
            data-testid="button-clear-search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="submit"
          disabled={!query.trim() || isLoading}
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2",
            size === "large" && "h-10 px-6"
          )}
          data-testid="button-search-submit"
        >
          {isLoading ? "..." : "Search"}
        </Button>
      </form>

      <ToggleGroup
        type="single"
        value={searchType}
        onValueChange={(value) => value && setSearchType(value as SearchType)}
        className="justify-start"
      >
        {searchTypeConfig.map((config) => (
          <ToggleGroupItem
            key={config.value}
            value={config.value}
            aria-label={`Search by ${config.label}`}
            className="gap-2"
            data-testid={`toggle-search-${config.value}`}
          >
            <config.icon className="h-4 w-4" />
            {config.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
