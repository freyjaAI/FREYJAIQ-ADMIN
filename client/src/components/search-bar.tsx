import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Building2, User, MapPin, Loader2, Briefcase, Command } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

type SearchType = "address" | "owner" | "business" | "person";

interface AddressSuggestion {
  description: string;
  placeId: string;
}

interface PersonSearchData {
  name: string;
  address: string;
  city: string;
  state: string;
}

interface SearchBarProps {
  onSearch: (query: string, type: SearchType, personData?: PersonSearchData) => void;
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

  // Person search fields
  const [personName, setPersonName] = useState("");
  const [personAddress, setPersonAddress] = useState("");
  const [personCity, setPersonCity] = useState("");
  const [personState, setPersonState] = useState("");

  // Keyboard shortcut handler (Cmd+K / Ctrl+K)
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
    
    if (searchType === "person") {
      // Person search with enhanced fields
      if (personName.trim()) {
        const personData: PersonSearchData = {
          name: personName.trim(),
          address: personAddress.trim(),
          city: personCity.trim(),
          state: personState.trim(),
        };
        setShowSuggestions(false);
        onSearch(personName.trim(), searchType, personData);
      }
    } else if (query.trim()) {
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
      case "business":
        return "Search by business name or EIN (XX-XXXXXXX)...";
      case "person":
        return "Enter person details below...";
      default:
        return "Search...";
    }
  };

  const searchTypeConfig = [
    { value: "address", icon: Building2, label: "Address" },
    { value: "owner", icon: User, label: "Owner" },
    { value: "business", icon: Briefcase, label: "Business / EIN" },
    { value: "person", icon: User, label: "Person" },
  ];

  // Detect if user is on Mac for keyboard shortcut display
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  const clearPersonFields = () => {
    setPersonName("");
    setPersonAddress("");
    setPersonCity("");
    setPersonState("");
  };

  const isPersonSearchValid = personName.trim().length > 0;

  // US States for dropdown
  const usStates = [
    "", "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
  ];

  return (
    <div className={cn("w-full space-y-3", className)}>
      {searchType === "person" ? (
        // Enhanced Person Search Form
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Name Field - Required */}
            <div className="md:col-span-2">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  type="text"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder="Full name (required)"
                  className={cn(
                    "pl-10 transition-all duration-200 border-border/50",
                    size === "large" 
                      ? "h-14 text-lg bg-card/80 backdrop-blur-sm focus:border-primary/50" 
                      : "",
                    isFocused && "border-primary/50"
                  )}
                  data-testid="input-person-name"
                />
              </div>
            </div>

            {/* Address Field - Optional */}
            <div className="md:col-span-2">
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={personAddress}
                  onChange={(e) => setPersonAddress(e.target.value)}
                  placeholder="Street address (optional - improves accuracy)"
                  className={cn(
                    "pl-10 transition-all duration-200 border-border/50",
                    size === "large" && "h-12 bg-card/80 backdrop-blur-sm"
                  )}
                  data-testid="input-person-address"
                />
              </div>
            </div>

            {/* City Field */}
            <div>
              <Input
                type="text"
                value={personCity}
                onChange={(e) => setPersonCity(e.target.value)}
                placeholder="City (optional)"
                className={cn(
                  "transition-all duration-200 border-border/50",
                  size === "large" && "h-12 bg-card/80 backdrop-blur-sm"
                )}
                data-testid="input-person-city"
              />
            </div>

            {/* State Field */}
            <div>
              <select
                value={personState}
                onChange={(e) => setPersonState(e.target.value)}
                className={cn(
                  "flex w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm ring-offset-background",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  size === "large" && "h-12 bg-card/80"
                )}
                data-testid="select-person-state"
              >
                <option value="">State (optional)</option>
                {usStates.filter(s => s).map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Button Row */}
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={!isPersonSearchValid || isLoading}
              className={cn(
                "flex-1",
                size === "large" && "h-12"
              )}
              data-testid="button-person-search-submit"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search Person
                </>
              )}
            </Button>
            {(personName || personAddress || personCity || personState) && (
              <Button
                type="button"
                variant="outline"
                onClick={clearPersonFields}
                className={cn(size === "large" && "h-12")}
                data-testid="button-clear-person-search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Helper text */}
          <p className="text-xs text-muted-foreground">
            Add address details to improve search accuracy and find better contact matches.
          </p>
        </form>
      ) : (
        // Standard Search Form (Address, Owner, Business/EIN)
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
      )}

      <ToggleGroup
        type="single"
        value={searchType}
        onValueChange={(value) => {
          if (value) {
            setSearchType(value as SearchType);
            setSuggestions([]);
            setShowSuggestions(false);
            // Clear fields when switching types
            setQuery("");
            clearPersonFields();
          }
        }}
        className="justify-start flex-wrap gap-1"
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
