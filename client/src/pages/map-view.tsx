import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapPin, Building2, User, DollarSign, Loader2, Maximize2, List, Filter, X, AlertCircle, MapPinned } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { Owner, Property } from "@shared/schema";

declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

type OwnerWithProperties = Owner & { properties: Property[] };

function formatCurrency(value: number | null | undefined): string {
  if (!value) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function PropertyCard({ property, owner }: { property: Property; owner: Owner }) {
  return (
    <Card className="bg-zinc-900/80 border-white/10 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate">{property.address}</h4>
            <p className="text-xs text-muted-foreground">
              {property.city}, {property.state} {property.zipCode}
            </p>
          </div>
          {property.propertyType && (
            <Badge variant="outline" className="text-xs shrink-0">
              {property.propertyType}
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div>
            <span className="text-muted-foreground">Value:</span>{" "}
            <span className="font-medium">{formatCurrency(property.assessedValue)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Sq Ft:</span>{" "}
            <span className="font-medium">{property.sqFt?.toLocaleString() || "N/A"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
          <User className="h-3 w-3 text-muted-foreground" />
          <Link href={`/owners/${owner.id}`}>
            <span className="text-xs text-primary hover:underline cursor-pointer">{owner.name}</span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function MapSkeleton() {
  return (
    <div className="h-full w-full bg-zinc-900/50 flex items-center justify-center">
      <FreyjaLoader 
        message="Initializing property map" 
        submessage="Loading Google Maps..."
        size="md"
      />
    </div>
  );
}

export default function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<{ property: Property; owner: Owner } | null>(null);
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>("all");
  const [showSidebar, setShowSidebar] = useState(true);

  const { data: owners, isLoading, isError: ownersError } = useQuery<OwnerWithProperties[]>({
    queryKey: ["/api/owners"],
  });

  const { data: apiKeyData, isError: mapsKeyError } = useQuery<{ apiKey: string }>({
    queryKey: ["/api/maps/key"],
  });

  const { toast } = useToast();

  const geocodeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/properties/geocode-all", {
        method: "POST",
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/owners"] });
      toast({
        title: "Geocoding Complete",
        description: `Successfully geocoded ${data.geocoded} of ${data.total} properties.${data.failed > 0 ? ` ${data.failed} failed.` : ""}`,
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Geocoding Failed",
        description: "Could not geocode properties. Please try again.",
      });
    },
  });

  const propertiesWithoutCoords = (owners?.flatMap((owner) =>
    owner.properties.filter(p => !p.latitude || !p.longitude).map((property) => ({ property, owner }))
  ) || []).length;

  const allProperties = owners?.flatMap((owner) =>
    owner.properties.map((property) => ({ property, owner }))
  ) || [];

  const propertyTypes = Array.from(new Set(allProperties.map((p) => p.property.propertyType).filter(Boolean)));

  const filteredProperties = allProperties.filter((p) => {
    if (propertyTypeFilter === "all") return true;
    return p.property.propertyType === propertyTypeFilter;
  });

  const propertiesWithCoords = filteredProperties.filter(
    (p) => p.property.latitude && p.property.longitude
  );

  const initializeMap = useCallback(() => {
    if (!mapRef.current || !window.google || mapInstanceRef.current) return;

    const map = new window.google.maps.Map(mapRef.current, {
      zoom: 4,
      center: { lat: 39.8283, lng: -98.5795 },
      mapId: "freyja-iq-map",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
        {
          featureType: "administrative.locality",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }],
        },
        {
          featureType: "poi",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }],
        },
        {
          featureType: "poi.park",
          elementType: "geometry",
          stylers: [{ color: "#263c3f" }],
        },
        {
          featureType: "poi.park",
          elementType: "labels.text.fill",
          stylers: [{ color: "#6b9a76" }],
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#38414e" }],
        },
        {
          featureType: "road",
          elementType: "geometry.stroke",
          stylers: [{ color: "#212a37" }],
        },
        {
          featureType: "road",
          elementType: "labels.text.fill",
          stylers: [{ color: "#9ca5b3" }],
        },
        {
          featureType: "road.highway",
          elementType: "geometry",
          stylers: [{ color: "#746855" }],
        },
        {
          featureType: "road.highway",
          elementType: "geometry.stroke",
          stylers: [{ color: "#1f2835" }],
        },
        {
          featureType: "road.highway",
          elementType: "labels.text.fill",
          stylers: [{ color: "#f3d19c" }],
        },
        {
          featureType: "transit",
          elementType: "geometry",
          stylers: [{ color: "#2f3948" }],
        },
        {
          featureType: "transit.station",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }],
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#17263c" }],
        },
        {
          featureType: "water",
          elementType: "labels.text.fill",
          stylers: [{ color: "#515c6d" }],
        },
        {
          featureType: "water",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#17263c" }],
        },
      ],
    });

    mapInstanceRef.current = map;
    infoWindowRef.current = new window.google.maps.InfoWindow();
    setMapLoaded(true);
  }, []);

  useEffect(() => {
    if (!apiKeyData?.apiKey) return;

    if (window.google) {
      initializeMap();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKeyData.apiKey}&libraries=marker&callback=initMap`;
    script.async = true;
    script.defer = true;

    window.initMap = () => {
      initializeMap();
    };

    document.head.appendChild(script);

    return () => {
      window.initMap = () => {};
    };
  }, [apiKeyData?.apiKey, initializeMap]);

  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoaded) return;

    markersRef.current.forEach((marker) => {
      marker.map = null;
    });
    markersRef.current = [];

    if (propertiesWithCoords.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();

    propertiesWithCoords.forEach(({ property, owner }) => {
      if (!property.latitude || !property.longitude) return;

      const position = { lat: property.latitude, lng: property.longitude };
      bounds.extend(position);

      const pinElement = document.createElement("div");
      pinElement.className = "custom-marker";
      pinElement.innerHTML = `
        <div style="
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </div>
      `;

      pinElement.addEventListener("mouseenter", () => {
        pinElement.style.transform = "scale(1.15)";
      });
      pinElement.addEventListener("mouseleave", () => {
        pinElement.style.transform = "scale(1)";
      });

      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        map: mapInstanceRef.current,
        position,
        content: pinElement,
        title: property.address,
      });

      marker.addListener("click", () => {
        setSelectedProperty({ property, owner });

        if (infoWindowRef.current) {
          const content = `
            <div style="padding: 8px; max-width: 250px; color: #1a1a2e;">
              <h4 style="font-weight: 600; margin: 0 0 4px 0; font-size: 14px;">${property.address}</h4>
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #666;">
                ${property.city}, ${property.state} ${property.zipCode}
              </p>
              <div style="font-size: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                <div><strong>Value:</strong> ${formatCurrency(property.assessedValue)}</div>
                <div><strong>Sq Ft:</strong> ${property.sqFt?.toLocaleString() || "N/A"}</div>
              </div>
              <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 12px;">
                <strong>Owner:</strong> ${owner.name}
              </div>
            </div>
          `;
          infoWindowRef.current.setContent(content);
          infoWindowRef.current.open(mapInstanceRef.current, marker);
        }
      });

      markersRef.current.push(marker);
    });

    if (propertiesWithCoords.length > 0) {
      mapInstanceRef.current.fitBounds(bounds);
      if (propertiesWithCoords.length === 1) {
        mapInstanceRef.current.setZoom(15);
      }
    }
  }, [propertiesWithCoords, mapLoaded]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-4 p-4 border-b border-border/50 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Property Map
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-property-count">
            <span data-testid="text-geocoded-count">{propertiesWithCoords.length}</span> of{" "}
            <span data-testid="text-total-count">{allProperties.length}</span> properties with coordinates
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {propertiesWithoutCoords > 0 && (
            <Button 
              variant="outline"
              size="sm"
              onClick={() => geocodeMutation.mutate()}
              disabled={geocodeMutation.isPending}
              data-testid="button-geocode-header"
            >
              {geocodeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Geocoding...
                </>
              ) : (
                <>
                  <MapPinned className="h-4 w-4 mr-2" />
                  Geocode {propertiesWithoutCoords} Properties
                </>
              )}
            </Button>
          )}
          <Select value={propertyTypeFilter} onValueChange={setPropertyTypeFilter}>
            <SelectTrigger className="w-[160px] bg-zinc-900/50 border-white/10" data-testid="select-property-type">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Property Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="option-type-all">All Types</SelectItem>
              {propertyTypes.map((type) => (
                <SelectItem key={type} value={type!} data-testid={`option-type-${type}`}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowSidebar(!showSidebar)}
            data-testid="button-toggle-sidebar"
          >
            {showSidebar ? <X className="h-4 w-4" /> : <List className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          {ownersError || mapsKeyError ? (
            <div className="h-full w-full bg-zinc-900/50 flex items-center justify-center" data-testid="error-state">
              <Card className="bg-zinc-900/90 border-white/10 max-w-md">
                <CardContent className="p-6 text-center">
                  <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-3" />
                  <h3 className="font-medium mb-2">Unable to Load Map</h3>
                  <p className="text-sm text-muted-foreground">
                    {mapsKeyError 
                      ? "Google Maps API key is not configured. Please contact support."
                      : "Failed to load property data. Please try again later."}
                  </p>
                  <Button onClick={() => window.location.reload()} className="mt-4" data-testid="button-retry">
                    Retry
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : isLoading || !apiKeyData?.apiKey ? (
            <MapSkeleton />
          ) : (
            <div ref={mapRef} className="h-full w-full" data-testid="map-container" />
          )}

          {propertiesWithCoords.length === 0 && !isLoading && apiKeyData?.apiKey && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 backdrop-blur-sm">
              <Card className="bg-zinc-900/90 border-white/10 max-w-md">
                <CardContent className="p-6 text-center">
                  <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-medium mb-2">No Properties to Display</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Properties need geocoded coordinates to appear on the map.
                    {propertiesWithoutCoords > 0 
                      ? ` You have ${propertiesWithoutCoords} properties that can be geocoded.`
                      : " Search for properties to add them to your database."}
                  </p>
                  <div className="flex flex-col gap-2">
                    {propertiesWithoutCoords > 0 && (
                      <Button 
                        onClick={() => geocodeMutation.mutate()}
                        disabled={geocodeMutation.isPending}
                        data-testid="button-geocode-all"
                      >
                        {geocodeMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Geocoding {propertiesWithoutCoords} properties...
                          </>
                        ) : (
                          <>
                            <MapPinned className="h-4 w-4 mr-2" />
                            Geocode All Properties
                          </>
                        )}
                      </Button>
                    )}
                    <Button asChild variant="outline" data-testid="button-search-properties">
                      <Link href="/search">Search Properties</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {showSidebar && (
          <div className="w-80 border-l border-border/50 bg-background/50 backdrop-blur-sm overflow-y-auto">
            <div className="p-4 border-b border-border/50 sticky top-0 bg-background/80 backdrop-blur-sm z-10">
              <h3 className="font-medium flex items-center gap-2" data-testid="text-sidebar-count">
                <Building2 className="h-4 w-4" />
                Properties ({filteredProperties.length})
              </h3>
            </div>
            <div className="p-3 space-y-3">
              {isLoading ? (
                <>
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </>
              ) : filteredProperties.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No properties found
                </p>
              ) : (
                filteredProperties.map(({ property, owner }) => (
                  <div
                    key={property.id}
                    onClick={() => {
                      setSelectedProperty({ property, owner });
                      if (mapInstanceRef.current && property.latitude && property.longitude) {
                        mapInstanceRef.current.panTo({
                          lat: property.latitude,
                          lng: property.longitude,
                        });
                        mapInstanceRef.current.setZoom(16);
                      }
                    }}
                    className={`cursor-pointer transition-all ${
                      selectedProperty?.property.id === property.id
                        ? "ring-2 ring-primary rounded-lg"
                        : ""
                    }`}
                    data-testid={`card-property-${property.id}`}
                  >
                    <PropertyCard property={property} owner={owner} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
