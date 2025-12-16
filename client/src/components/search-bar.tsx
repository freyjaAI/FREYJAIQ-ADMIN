import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Building2, User, Hash, MapPin, Loader2, Briefcase, FileText, Command } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

type SearchType = "address" | "owner" | "apn" | "business" | "ein" | "person";

interface AddressSuggestion {
  description: string;
  placeId: string;
}

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
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Keyboard shortcut handler (⌘K / Ctrl+K)
  const handleKeyboardShortcut = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardShortcut);
    return () => document.removeEventListener('keydown', handleKeyboardShortcut);
  }, [handleKeyboardShortcut]);

  useEffect(() => {
    if (searchType !== "address" || query.length < 3) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const response = await fetch(`/api/address/autocomplete?input=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch (error) {
        console.error("Autocomplete error:", error);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, searchType]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setShowSuggestions(false);
      onSearch(query.trim(), searchType);
    }
  };

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    setQuery(suggestion.description);
    setShowSuggestions(false);
    setSuggestions([]);
    onSearch(suggestion.description, searchType);
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
      case "business":
        return "Search by business or company name...";
      case "ein":
        return "Search by EIN / Tax ID (XX-XXXXXXX)...";
      case "person":
        return "Search by person name...";
      default:
        return "Search...";
    }
  };

  const searchTypeConfig = [
    { value: "address", icon: Building2, label: "Address" },
    { value: "owner", icon: User, label: "Owner" },
    { value: "apn", icon: Hash, label: "APN" },
    { value: "business", icon: Briefcase, label: "Business" },
    { value: "ein", icon: FileText, label: "EIN" },
    { value: "person", icon: User, label: "Person" },
  ];

  // Detect if user is on Mac for keyboard shortcut display
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  return (
    <div className={cn("w-full space-y-3", className)}>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div 
          className={cn(
            "relative flex-1 rounded-md transition-all duration-200",
            size === "large" && "backdrop-blur-sm",
            isFocused && size === "large" && "search-glow"
          )}
        >
          <Search
            className={cn(
              "absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors",
              size === "large" ? "h-5 w-5" : "h-4 w-4",
              isFocused && "text-primary"
            )}
          />
          <Input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              setIsFocused(true);
              suggestions.length > 0 && setShowSuggestions(true);
            }}
            onBlur={() => setIsFocused(false)}
            placeholder={getPlaceholder()}
            className={cn(
              "pl-11 transition-all duration-200 border-border/50",
              size === "large" 
                ? "h-16 text-lg pr-24 bg-card/80 backdrop-blur-sm focus:border-primary/50" 
                : "pr-10",
              isFocused && "border-primary/50"
            )}
            data-testid="input-search"
          />
          
          {/* Keyboard shortcut hint */}
          {size === "large" && !query && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
              <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border border-border/50 bg-muted/50 px-2 font-mono text-xs text-muted-foreground">
                {isMac ? (
                  <>
                    <Command className="h-3 w-3" />
                    <span>K</span>
                  </>
                ) : (
                  <span>Ctrl+K</span>
                )}
              </kbd>
            </div>
          )}
          
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "absolute top-1/2 -translate-y-1/2",
                size === "large" ? "right-4" : "right-2"
              )}
              onClick={() => {
                setQuery("");
                setSuggestions([]);
              }}
              data-testid="button-clear-search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-50 w-full mt-1 bg-popover/95 backdrop-blur-sm border border-border/50 rounded-md shadow-lg max-h-60 overflow-auto"
            >
              {loadingSuggestions && (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.placeId}
                  type="button"
                  className="w-full px-4 py-3 text-left text-sm hover-elevate flex items-center gap-3"
                  onClick={() => handleSelectSuggestion(suggestion)}
                  data-testid={`suggestion-${index}`}
                >
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{suggestion.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          type="submit"
          disabled={!query.trim() || isLoading}
          className={cn(
            size === "large" && "h-14 px-6"
          )}
          data-testid="button-search-submit"
        >
          {isLoading ? "..." : "Search"}
        </Button>
      </form>

      <ToggleGroup
        type="single"
        value={searchType}
        onValueChange={(value) => {
          if (value) {
            setSearchType(value as SearchType);
            setSuggestions([]);
            setShowSuggestions(false);
          }
        }}
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
