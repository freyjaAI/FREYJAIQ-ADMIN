import { Scale, FileWarning, Gavel, AlertTriangle, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LegalEvent } from "@shared/schema";

interface LegalEventsTimelineProps {
  events: LegalEvent[];
  title?: string;
}

const eventTypeConfig: Record<
  string,
  { icon: typeof Scale; color: string; label: string }
> = {
  lien: { icon: Gavel, color: "text-orange-500", label: "Lien" },
  judgment: { icon: Scale, color: "text-red-500", label: "Judgment" },
  lawsuit: { icon: Scale, color: "text-red-600", label: "Lawsuit" },
  bankruptcy: { icon: FileWarning, color: "text-red-700", label: "Bankruptcy" },
  eviction: { icon: AlertTriangle, color: "text-yellow-600", label: "Eviction" },
  tax_lien: { icon: CreditCard, color: "text-orange-600", label: "Tax Lien" },
};

export function LegalEventsTimeline({
  events,
  title = "Legal Events",
}: LegalEventsTimelineProps) {
  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Unknown date";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return null;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const sortedEvents = [...events].sort((a, b) => {
    const dateA = a.filedDate ? new Date(a.filedDate).getTime() : 0;
    const dateB = b.filedDate ? new Date(b.filedDate).getTime() : 0;
    return dateB - dateA;
  });

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-4">
            No legal events found
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {title}
          <Badge variant="secondary" className="text-xs">
            {events.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative space-y-0">
          {sortedEvents.map((event, index) => {
            const config = eventTypeConfig[event.type.toLowerCase()] || {
              icon: Scale,
              color: "text-muted-foreground",
              label: event.type,
            };
            const Icon = config.icon;
            const isLast = index === sortedEvents.length - 1;

            return (
              <div
                key={event.id}
                className="relative pl-8 pb-4"
                data-testid={`legal-event-${event.id}`}
              >
                <div
                  className={cn(
                    "absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-background border-2",
                    config.color.replace("text-", "border-")
                  )}
                >
                  <Icon className={cn("h-3 w-3", config.color)} />
                </div>
                {!isLast && (
                  <div className="absolute left-3 top-6 bottom-0 w-px bg-border" />
                )}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        config.color.replace("text-", "border-")
                      )}
                    >
                      {config.label}
                    </Badge>
                    {event.status && (
                      <Badge variant="secondary" className="text-xs">
                        {event.status}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(event.filedDate)}
                    </span>
                  </div>
                  <div className="text-sm">
                    {event.description || `${config.label} filed`}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {event.jurisdiction && (
                      <span>Jurisdiction: {event.jurisdiction}</span>
                    )}
                    {event.caseNumber && (
                      <span className="font-mono">Case: {event.caseNumber}</span>
                    )}
                    {event.amount && (
                      <span className="font-semibold text-foreground">
                        {formatCurrency(event.amount)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
