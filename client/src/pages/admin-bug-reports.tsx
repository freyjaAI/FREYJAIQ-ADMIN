import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Bug, 
  Lightbulb, 
  HelpCircle, 
  Clock, 
  Search as SearchIcon, 
  CheckCircle2,
  ExternalLink,
  Monitor,
  User,
  Calendar,
  ChevronDown,
  Image as ImageIcon,
  AlertCircle,
  Filter,
} from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { FreyjaLoader } from "@/components/freyja-loader";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BugReport } from "@shared/schema";

type StatusFilter = "all" | "open" | "investigating" | "resolved";
type TypeFilter = "all" | "bug" | "feature" | "question";

const issueTypeConfig = {
  bug: { icon: Bug, label: "Bug", color: "text-red-400 bg-red-500/20 border-red-500/30" },
  feature: { icon: Lightbulb, label: "Feature", color: "text-amber-400 bg-amber-500/20 border-amber-500/30" },
  question: { icon: HelpCircle, label: "Question", color: "text-blue-400 bg-blue-500/20 border-blue-500/30" },
};

const statusConfig = {
  open: { icon: AlertCircle, label: "Open", color: "text-yellow-400 bg-yellow-500/20 border-yellow-500/30" },
  investigating: { icon: SearchIcon, label: "Investigating", color: "text-blue-400 bg-blue-500/20 border-blue-500/30" },
  resolved: { icon: CheckCircle2, label: "Resolved", color: "text-green-400 bg-green-500/20 border-green-500/30" },
};

function BugReportSkeleton() {
  return (
    <Card className="bg-zinc-900/50 border-white/10">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  );
}

export default function AdminBugReportsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: reports, isLoading } = useQuery<BugReport[]>({
    queryKey: ["/api/bug-reports"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/bug-reports/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bug-reports"] });
      toast({
        title: "Status updated",
        description: "The bug report status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Could not update the status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredReports = reports?.filter((report) => {
    if (statusFilter !== "all" && report.status !== statusFilter) return false;
    if (typeFilter !== "all" && report.issueType !== typeFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        report.description?.toLowerCase().includes(query) ||
        report.pageUrl?.toLowerCase().includes(query) ||
        report.userId?.toLowerCase().includes(query)
      );
    }
    return true;
  }) || [];

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const stats = {
    total: reports?.length || 0,
    open: reports?.filter((r) => r.status === "open").length || 0,
    investigating: reports?.filter((r) => r.status === "investigating").length || 0,
    resolved: reports?.filter((r) => r.status === "resolved").length || 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bug Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and respond to user feedback
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900/50 border-white/10" data-testid="card-stat-total">
          <CardContent className="p-4">
            <div className="text-2xl font-bold" data-testid="text-stat-total">{stats.total}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-white/10" data-testid="card-stat-open">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-yellow-400" data-testid="text-stat-open">{stats.open}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Open</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-white/10" data-testid="card-stat-investigating">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-400" data-testid="text-stat-investigating">{stats.investigating}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Investigating</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-white/10" data-testid="card-stat-resolved">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-400" data-testid="text-stat-resolved">{stats.resolved}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Resolved</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-zinc-900/50 border-white/10"
            data-testid="input-search-reports"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[140px] bg-zinc-900/50 border-white/10" data-testid="select-status-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" data-testid="option-status-all">All Status</SelectItem>
            <SelectItem value="open" data-testid="option-status-open">Open</SelectItem>
            <SelectItem value="investigating" data-testid="option-status-investigating">Investigating</SelectItem>
            <SelectItem value="resolved" data-testid="option-status-resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="w-[140px] bg-zinc-900/50 border-white/10" data-testid="select-type-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" data-testid="option-type-all">All Types</SelectItem>
            <SelectItem value="bug" data-testid="option-type-bug">Bug</SelectItem>
            <SelectItem value="feature" data-testid="option-type-feature">Feature</SelectItem>
            <SelectItem value="question" data-testid="option-type-question">Question</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reports List */}
      <div className="space-y-3">
        {isLoading ? (
          <Card className="bg-zinc-900/50 border-white/10">
            <CardContent className="py-16">
              <FreyjaLoader 
                message="Enriching through proprietary FreyjaIQ waterfall" 
                submessage="Loading bug reports..."
                size="md"
              />
            </CardContent>
          </Card>
        ) : filteredReports.length === 0 ? (
          <Card className="bg-zinc-900/50 border-white/10">
            <CardContent className="p-8 text-center">
              <Bug className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-medium">No reports found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery || statusFilter !== "all" || typeFilter !== "all"
                  ? "Try adjusting your filters"
                  : "No bug reports have been submitted yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredReports.map((report) => {
            const typeConfig = issueTypeConfig[report.issueType as keyof typeof issueTypeConfig] || issueTypeConfig.bug;
            const statConfig = statusConfig[report.status as keyof typeof statusConfig] || statusConfig.open;
            const TypeIcon = typeConfig.icon;
            const StatusIcon = statConfig.icon;
            const isExpanded = expandedIds.has(report.id);

            return (
              <Card key={report.id} className="bg-zinc-900/50 border-white/10" data-testid={`card-report-${report.id}`}>
                <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(report.id)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <Badge variant="outline" className={typeConfig.color}>
                            <TypeIcon className="h-3 w-3 mr-1" />
                            {typeConfig.label}
                          </Badge>
                          <Badge variant="outline" className={statConfig.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statConfig.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {report.createdAt ? format(new Date(report.createdAt), "MMM d, yyyy 'at' h:mm a") : "Unknown"}
                          </span>
                        </div>
                        <p className="text-sm line-clamp-2">{report.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="gap-1"
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-status-${report.id}`}
                            >
                              Update Status
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => updateStatusMutation.mutate({ id: report.id, status: "open" })}
                              data-testid={`button-status-open-${report.id}`}
                            >
                              <AlertCircle className="h-4 w-4 mr-2 text-yellow-400" />
                              Mark as Open
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => updateStatusMutation.mutate({ id: report.id, status: "investigating" })}
                              data-testid={`button-status-investigating-${report.id}`}
                            >
                              <SearchIcon className="h-4 w-4 mr-2 text-blue-400" />
                              Mark as Investigating
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => updateStatusMutation.mutate({ id: report.id, status: "resolved" })}
                              data-testid={`button-status-resolved-${report.id}`}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2 text-green-400" />
                              Mark as Resolved
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-expand-${report.id}`}>
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>

                    <CollapsibleContent className="mt-4 pt-4 border-t border-white/10 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        {report.pageUrl && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <ExternalLink className="h-4 w-4 shrink-0" />
                            <span className="truncate">{report.pageUrl}</span>
                          </div>
                        )}
                        {report.userId && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <User className="h-4 w-4 shrink-0" />
                            <span className="truncate font-mono text-xs">{report.userId}</span>
                          </div>
                        )}
                        {report.viewport && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Monitor className="h-4 w-4 shrink-0" />
                            <span>{report.viewport}</span>
                          </div>
                        )}
                        {report.userAgent && (
                          <div className="flex items-center gap-2 text-muted-foreground col-span-full">
                            <span className="text-xs truncate">{report.userAgent}</span>
                          </div>
                        )}
                      </div>

                      {report.screenshot && (
                        <div className="mt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedReport(report)}
                            className="gap-2"
                            data-testid={`button-view-screenshot-${report.id}`}
                          >
                            <ImageIcon className="h-4 w-4" />
                            View Screenshot
                          </Button>
                        </div>
                      )}
                    </CollapsibleContent>
                  </CardContent>
                </Collapsible>
              </Card>
            );
          })
        )}
      </div>

      {/* Screenshot Modal */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-4xl bg-zinc-900/98 backdrop-blur-xl border-white/10">
          <DialogHeader>
            <DialogTitle>Screenshot</DialogTitle>
          </DialogHeader>
          {selectedReport?.screenshot && (
            <div className="overflow-auto max-h-[70vh]">
              <img
                src={selectedReport.screenshot}
                alt="Bug report screenshot"
                className="w-full rounded-lg border border-white/10"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
