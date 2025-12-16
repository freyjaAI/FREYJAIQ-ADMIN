import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FileText, Download, Calendar, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FreyjaLoader } from "@/components/freyja-loader";
import type { DossierExport, Owner, User as UserType } from "@shared/schema";

interface DossierExportWithRelations extends DossierExport {
  owner?: Owner;
}

export default function DossiersPage() {
  const { data: exports, isLoading } = useQuery<DossierExportWithRelations[]>({
    queryKey: ["/api/dossiers"],
  });

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Unknown";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Dossiers</h1>
        <p className="text-muted-foreground">
          View and download previously generated owner dossiers.
        </p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-16">
            <FreyjaLoader 
              message="Enriching through proprietary FreyjaIQ waterfall" 
              submessage="Loading dossier history..."
              size="md"
            />
          </CardContent>
        </Card>
      ) : exports && exports.length > 0 ? (
        <div className="space-y-3">
          {exports.map((exp) => (
            <Card key={exp.id} className="hover-elevate" data-testid={`dossier-${exp.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {exp.owner?.name || "Unknown Owner"}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {exp.format?.toUpperCase() || "PDF"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(exp.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/owners/${exp.ownerId}`}>
                        <User className="h-4 w-4 mr-1" />
                        View
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No dossiers yet</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                Generate your first dossier by viewing an owner's profile and
                clicking "Export PDF".
              </p>
              <Button asChild className="mt-4">
                <Link href="/search">Search for Owners</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
