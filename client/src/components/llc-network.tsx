import { Building2, User, Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/score-badge";
import type { Owner, OwnerLlcLink } from "@shared/schema";

interface LlcNetworkProps {
  owner: Owner;
  linkedLlcs: (OwnerLlcLink & { llc?: Owner })[];
  title?: string;
}

export function LlcNetwork({
  owner,
  linkedLlcs,
  title = "LLC Connections",
}: LlcNetworkProps) {
  // Hide section entirely when no LLC connections
  if (linkedLlcs.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {title}
          <Badge variant="secondary" className="text-xs">
            {linkedLlcs.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
              {owner.type === "entity" ? (
                <Building2 className="h-5 w-5 text-primary-foreground" />
              ) : (
                <User className="h-5 w-5 text-primary-foreground" />
              )}
            </div>
            <div>
              <div className="font-semibold">{owner.name}</div>
              <div className="text-xs text-muted-foreground">
                {owner.type === "entity" ? "Entity" : "Individual"}
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="h-6 w-px bg-border" />
          </div>

          <div className="space-y-2">
            {linkedLlcs.map((link) => (
              <div
                key={link.id}
                className="flex items-center gap-3 p-3 rounded-lg border hover-elevate"
                data-testid={`llc-link-${link.id}`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted flex-shrink-0">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">
                      {link.llc?.name || "Unknown LLC"}
                    </span>
                    {link.relationship && (
                      <Badge variant="outline" className="text-xs">
                        {link.relationship}
                      </Badge>
                    )}
                  </div>
                  {link.aiRationale && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {link.aiRationale}
                    </div>
                  )}
                </div>
                {link.confidenceScore !== null &&
                  link.confidenceScore !== undefined && (
                    <ScoreBadge
                      score={link.confidenceScore}
                      label="Match"
                      size="sm"
                    />
                  )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
