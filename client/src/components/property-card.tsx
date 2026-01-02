import { Link, useLocation } from "wouter";
import { Building, MapPin, Calendar, DollarSign, ChevronRight, Home, Percent, Landmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/risk-badge";
import type { Property } from "@shared/schema";

interface MortgageData {
  interestRate?: number;
  interestRateType?: string;
  loanAmount?: number;
  lenderName?: string;
  loanType?: string;
  loanPurpose?: string;
  originationDate?: string;
  maturityDate?: string;
  termInMonths?: number;
  loanPosition?: string;
}

interface PropertyCardProps {
  property: Property & { mortgage?: MortgageData };
  showOwnerLink?: boolean;
  compact?: boolean;
}

export function PropertyCard({
  property,
  showOwnerLink = true,
  compact = false,
}: PropertyCardProps) {
  const [, navigate] = useLocation();
  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });
  };

  const propertyTypeIcons: Record<string, typeof Home> = {
    residential: Home,
    commercial: Building,
    industrial: Building,
    land: MapPin,
  };

  const Icon =
    propertyTypeIcons[property.propertyType?.toLowerCase() || ""] || Building;

  const handleCardClick = () => {
    if (property.ownerId) {
      navigate(`/owners/${property.ownerId}`);
    }
  };

  if (compact) {
    return (
      <div
        className="flex items-center justify-between gap-4 p-3 rounded-lg border hover-elevate cursor-pointer"
        data-testid={`card-property-compact-${property.id}`}
        onClick={handleCardClick}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted flex-shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{property.address}</div>
            <div className="text-xs text-muted-foreground">
              {property.city}, {property.state} {property.zipCode}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <div className="font-semibold">
              {formatCurrency(property.assessedValue)}
            </div>
            <div className="text-xs text-muted-foreground">Assessed</div>
          </div>
          {showOwnerLink && property.ownerId && (
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/owners/${property.ownerId}`}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card
      className="hover-elevate transition-all cursor-pointer"
      data-testid={`card-property-${property.id}`}
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted flex-shrink-0 mt-0.5">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">{property.address}</h3>
                <div className="text-sm text-muted-foreground">
                  {property.city}, {property.state} {property.zipCode}
                </div>
              </div>
            </div>
            {property.propertyType && (
              <Badge variant="outline">{property.propertyType}</Badge>
            )}
          </div>

          {property.apn && (
            <div className="text-xs text-muted-foreground font-mono">
              APN: {property.apn}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {formatCurrency(property.assessedValue)}
                </div>
                <div className="text-xs text-muted-foreground">Assessed Value</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {formatDate(property.lastSaleDate)}
                </div>
                <div className="text-xs text-muted-foreground">Last Sale</div>
              </div>
            </div>
          </div>

          {property.lastSalePrice && (
            <div className="text-sm">
              <span className="text-muted-foreground">Last Sale Price: </span>
              <span className="font-medium">
                {formatCurrency(property.lastSalePrice)}
              </span>
            </div>
          )}

          {property.mortgage && property.mortgage.loanAmount && property.mortgage.loanAmount > 0 && (
            <div className="p-3 bg-muted/50 rounded-md space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Landmark className="h-4 w-4 text-muted-foreground" />
                <span>Mortgage Details</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {property.mortgage.interestRate !== undefined && property.mortgage.interestRate > 0 && (
                  <div className="flex items-center gap-2">
                    <Percent className="h-3 w-3 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{property.mortgage.interestRate}%</div>
                      <div className="text-xs text-muted-foreground">
                        {property.mortgage.interestRateType || "Rate"}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{formatCurrency(property.mortgage.loanAmount)}</div>
                    <div className="text-xs text-muted-foreground">Loan Amount</div>
                  </div>
                </div>
              </div>
              {property.mortgage.lenderName && (
                <div className="text-xs text-muted-foreground">
                  Lender: {property.mortgage.lenderName}
                </div>
              )}
            </div>
          )}

          {property.riskSignals && property.riskSignals.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {property.riskSignals.map((signal) => (
                <RiskBadge key={signal} type={signal} />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {property.sqFt && <span>{property.sqFt.toLocaleString()} sq ft</span>}
              {property.units && <span>{property.units} units</span>}
              {property.yearBuilt && <span>Built {property.yearBuilt}</span>}
            </div>
            {showOwnerLink && property.ownerId && (
              <Button variant="ghost" size="sm" asChild className="gap-1">
                <Link href={`/owners/${property.ownerId}`}>
                  View Owner
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
