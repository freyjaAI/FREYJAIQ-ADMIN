import { Link, useLocation } from "wouter";
import { Building2, Phone, Mail, ChevronRight, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/score-badge";
import { EntityTypeBadge, RiskBadge } from "@/components/risk-badge";
import type { Owner, Property, ContactInfo } from "@shared/schema";

interface OwnerCardProps {
  owner: Owner;
  properties?: Property[];
  contacts?: ContactInfo[];
  showActions?: boolean;
}

export function OwnerCard({
  owner,
  properties = [],
  contacts = [],
  showActions = true,
}: OwnerCardProps) {
  const [, navigate] = useLocation();
  const phoneContact = contacts.find((c) => c.kind === "phone");
  const emailContact = contacts.find((c) => c.kind === "email");

  const handleCardClick = () => {
    navigate(`/owners/${owner.id}`);
  };

  return (
    <Card
      className="hover-elevate transition-all cursor-pointer"
      data-testid={`card-owner-${owner.id}`}
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-base font-semibold truncate">{owner.name}</h3>
              <EntityTypeBadge type={owner.type} />
              {owner.riskFlags?.map((flag) => (
                <RiskBadge key={flag} type={flag} />
              ))}
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {owner.primaryAddress && (
                <div className="flex items-center gap-1 truncate">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{owner.primaryAddress}</span>
                </div>
              )}
              {properties.length > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Building2 className="h-3.5 w-3.5" />
                  <span>
                    {properties.length} propert
                    {properties.length === 1 ? "y" : "ies"}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6 flex-wrap">
              {phoneContact && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono">{phoneContact.value}</span>
                  {phoneContact.confidenceScore && (
                    <ScoreBadge
                      score={phoneContact.confidenceScore}
                      size="sm"
                      showLabel={false}
                    />
                  )}
                </div>
              )}
              {emailContact && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{emailContact.value}</span>
                  {emailContact.confidenceScore && (
                    <ScoreBadge
                      score={emailContact.confidenceScore}
                      size="sm"
                      showLabel={false}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-3 flex-shrink-0">
            {owner.sellerIntentScore !== null &&
              owner.sellerIntentScore !== undefined && (
                <div className="text-right">
                  <div className="text-xs text-muted-foreground mb-1">
                    Seller Intent
                  </div>
                  <ScoreBadge
                    score={owner.sellerIntentScore}
                    size="md"
                    showLabel={false}
                  />
                </div>
              )}
            {showActions && (
              <Button variant="ghost" size="sm" asChild className="gap-1">
                <Link href={`/owners/${owner.id}`} data-testid={`link-owner-${owner.id}`}>
                  View Dossier
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
