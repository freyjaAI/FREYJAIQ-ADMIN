import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function PropertyCardSkeleton() {
  return (
    <Card data-testid="skeleton-property-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-4 w-28" />
      </CardContent>
    </Card>
  );
}

export function ContactCardSkeleton() {
  return (
    <div className="p-3 rounded-md bg-muted/30 space-y-2" data-testid="skeleton-contact">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function LlcCardSkeleton() {
  return (
    <Card data-testid="skeleton-llc-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-40" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AiInsightsSkeleton() {
  return (
    <Card data-testid="skeleton-ai-insights">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <div className="pt-2">
          <Skeleton className="h-8 w-28" />
        </div>
      </CardContent>
    </Card>
  );
}

export function ScoreBreakdownSkeleton() {
  return (
    <Card data-testid="skeleton-score-breakdown">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-8 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function DossierHeaderSkeleton() {
  return (
    <div className="space-y-4" data-testid="skeleton-dossier-header">
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-9 rounded-md" />
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
    </div>
  );
}

export function ContactsSectionSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" data-testid="skeleton-contacts-section">
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: count }).map((_, i) => (
          <ContactCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function PropertiesSectionSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-3" data-testid="skeleton-properties-section">
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="grid gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <PropertyCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function InlineListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2 py-2" data-testid="skeleton-inline-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 flex-1 max-w-[200px]" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function FullDossierSkeleton() {
  return (
    <div className="space-y-6" data-testid="skeleton-full-dossier">
      <DossierHeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <PropertiesSectionSkeleton />
          <LlcCardSkeleton />
        </div>
        <div className="space-y-6">
          <ScoreBreakdownSkeleton />
          <ContactsSectionSkeleton />
          <AiInsightsSkeleton />
        </div>
      </div>
    </div>
  );
}
