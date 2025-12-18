import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Building2, 
  Users, 
  Search, 
  Download, 
  Play, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Target,
  TrendingUp,
  Mail,
  Phone,
  Briefcase,
  MapPin,
  RefreshCw
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { BulkEnrichmentJob, BulkEnrichmentResult, TargetingConfig } from "@shared/schema";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

const FAMILY_OFFICE_NAICS = [
  { code: "523920", label: "Portfolio Management" },
  { code: "523930", label: "Investment Advice" },
  { code: "523991", label: "Trust, Fiduciary Services" },
  { code: "525990", label: "Other Financial Vehicles" },
];

const DECISION_MAKER_TITLES = [
  "CIO", "Chief Investment Officer",
  "CTO", "Chief Technology Officer",
  "Head of Infrastructure",
  "Head of Real Assets",
  "Head of Alternatives",
  "Managing Director",
  "Principal",
  "Partner",
  "Director of Investments",
  "Portfolio Manager",
];

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: JSX.Element }> = {
    queued: { variant: "secondary", icon: <Clock className="w-3 h-3" /> },
    running: { variant: "default", icon: <RefreshCw className="w-3 h-3 animate-spin" /> },
    succeeded: { variant: "outline", icon: <CheckCircle2 className="w-3 h-3 text-green-500" /> },
    failed: { variant: "destructive", icon: <XCircle className="w-3 h-3" /> },
    cancelled: { variant: "secondary", icon: <AlertCircle className="w-3 h-3" /> },
  };

  const config = variants[status] || variants.queued;

  return (
    <Badge variant={config.variant} className="gap-1">
      {config.icon}
      {status}
    </Badge>
  );
}

function IntentBadge({ tier, score }: { tier: string; score: number }) {
  const colors: Record<string, string> = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    warm: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    monitor: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  return (
    <Badge className={`${colors[tier] || colors.monitor} gap-1`}>
      <TrendingUp className="w-3 h-3" />
      {tier} ({score})
    </Badge>
  );
}

function JobCard({ job, onSelect }: { job: BulkEnrichmentJob; onSelect: () => void }) {
  const progress = job.totalTargets ? Math.round((job.processedTargets || 0) / job.totalTargets * 100) : 0;

  return (
    <Card 
      className="hover-elevate cursor-pointer" 
      onClick={onSelect}
      data-testid={`job-card-${job.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">{job.name}</CardTitle>
          <StatusBadge status={job.status} />
        </div>
        <CardDescription>
          Created {new Date(job.createdAt!).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Building2 className="w-4 h-4" />
              {job.totalTargets} targets
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {job.enrichedContacts || 0} contacts
            </span>
          </div>
          {job.status === "running" && (
            <Progress value={progress} className="h-2" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultsTable({ results }: { results: BulkEnrichmentResult[] }) {
  if (!results.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No decision makers found yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-3">
        {results.map((result) => (
          <Card key={result.id} data-testid={`result-row-${result.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{result.fullName || "Unknown"}</span>
                    {result.intentTier && (
                      <IntentBadge tier={result.intentTier} score={result.intentScore || 0} />
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    {result.title || "No title"} at {result.companyName}
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-sm">
                  {result.email && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Mail className="w-3 h-3" /> {result.email}
                    </span>
                  )}
                  {(result.phone || result.cellPhone) && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Phone className="w-3 h-3" /> {result.cellPhone || result.phone}
                    </span>
                  )}
                  {result.city && result.state && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="w-3 h-3" /> {result.city}, {result.state}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

export default function BulkEnrichmentPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("jobs");

  const [jobName, setJobName] = useState("");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedNaics, setSelectedNaics] = useState<string[]>([]);
  const [selectedTitles, setSelectedTitles] = useState<string[]>(DECISION_MAKER_TITLES.slice(0, 4));
  const [keywords, setKeywords] = useState("family office, capital partners, private wealth");
  const [dataCenterFocus, setDataCenterFocus] = useState(true);
  const [companyLimit, setCompanyLimit] = useState<number>(50); // How many companies to pull
  
  // Data source toggles - priority order: SEC EDGAR (FREE) > OpenMart > Data Axle
  const [useSecEdgar, setUseSecEdgar] = useState(true); // Default to FREE source
  const [useOpenMart, setUseOpenMart] = useState(false);
  const [useApifyInvestors, setUseApifyInvestors] = useState(true); // Default ON for decision-maker enrichment

  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = useQuery<BulkEnrichmentJob[]>({
    queryKey: ["/api/bulk-enrichment/jobs"],
    refetchInterval: 5000,
  });

  const { data: selectedJob, isLoading: jobLoading } = useQuery<BulkEnrichmentJob & { results: BulkEnrichmentResult[] }>({
    queryKey: ["/api/bulk-enrichment/jobs", selectedJobId],
    enabled: !!selectedJobId,
    refetchInterval: selectedJobId ? 3000 : false,
  });

  const createJobMutation = useMutation({
    mutationFn: async (config: { name: string; targetingConfig: TargetingConfig }) => {
      const response = await apiRequest("POST", "/api/bulk-enrichment/jobs", config);
      return response.json();
    },
    onSuccess: (job) => {
      toast({
        title: "Enrichment job created",
        description: `Found ${job.totalTargets} potential family offices to enrich`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bulk-enrichment/jobs"] });
      setSelectedJobId(job.id);
      setActiveTab("jobs");
    },
    onError: () => {
      toast({
        title: "Failed to create job",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleCreateJob = () => {
    if (!jobName.trim()) {
      toast({
        title: "Job name required",
        description: "Please enter a name for this enrichment job",
        variant: "destructive",
      });
      return;
    }

    const config: TargetingConfig = {
      states: selectedStates.length ? selectedStates : undefined,
      naicsCodes: selectedNaics.length ? selectedNaics : undefined,
      companyNameKeywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
      targetTitles: selectedTitles,
      dataCenterIntentFocus: dataCenterFocus,
      includeIntentScoring: true,
      limit: companyLimit,
      // Data source options
      useSecEdgar: useSecEdgar,
      useOpenMart: useOpenMart,
      useApifyInvestors: useApifyInvestors,
    };

    createJobMutation.mutate({ name: jobName, targetingConfig: config });
  };

  const handleExport = async (jobId: string) => {
    window.open(`/api/bulk-enrichment/jobs/${jobId}/export`, "_blank");
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6" />
            Bulk Enrichment
          </h1>
          <p className="text-muted-foreground">
            Find family office decision makers interested in data center investments
          </p>
        </div>
        <Button onClick={() => setActiveTab("new")} data-testid="button-new-job">
          <Search className="w-4 h-4 mr-2" />
          New Search
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="jobs" data-testid="tab-jobs">Jobs ({jobs?.length || 0})</TabsTrigger>
          <TabsTrigger value="new" data-testid="tab-new">New Search</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-4">
          {selectedJobId && selectedJob ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <Button 
                    variant="ghost" 
                    onClick={() => setSelectedJobId(null)}
                    data-testid="button-back"
                  >
                    Back to Jobs
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedJob.status} />
                  {selectedJob.status === "succeeded" && (
                    <Button 
                      variant="outline" 
                      onClick={() => handleExport(selectedJob.id)}
                      data-testid="button-export"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                  )}
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>{selectedJob.name}</CardTitle>
                  <CardDescription>
                    {selectedJob.processedTargets || 0} / {selectedJob.totalTargets} companies processed
                    {" | "}
                    {selectedJob.enrichedContacts || 0} decision makers found
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedJob.status === "running" && (
                    <Progress 
                      value={selectedJob.totalTargets ? (selectedJob.processedTargets || 0) / selectedJob.totalTargets * 100 : 0} 
                      className="mb-4" 
                    />
                  )}
                  <ResultsTable results={selectedJob.results || []} />
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {jobsLoading ? (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin" />
                  Loading jobs...
                </div>
              ) : jobs?.length === 0 ? (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No enrichment jobs yet</p>
                  <Button 
                    className="mt-4" 
                    onClick={() => setActiveTab("new")}
                    data-testid="button-create-first"
                  >
                    Create your first search
                  </Button>
                </div>
              ) : (
                jobs?.map((job) => (
                  <JobCard 
                    key={job.id} 
                    job={job} 
                    onSelect={() => setSelectedJobId(job.id)} 
                  />
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="new">
          <Card>
            <CardHeader>
              <CardTitle>Configure Enrichment Search</CardTitle>
              <CardDescription>
                Search for family offices and enrich with decision maker contacts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="jobName">Job Name</Label>
                <Input
                  id="jobName"
                  placeholder="e.g., Q1 2025 Data Center Investor Outreach"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  data-testid="input-job-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyLimit">Number of Companies to Pull</Label>
                <Select 
                  value={String(companyLimit)} 
                  onValueChange={(v) => setCompanyLimit(Number(v))}
                >
                  <SelectTrigger data-testid="select-company-limit">
                    <SelectValue placeholder="Select limit..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 companies</SelectItem>
                    <SelectItem value="50">50 companies</SelectItem>
                    <SelectItem value="100">100 companies</SelectItem>
                    <SelectItem value="200">200 companies</SelectItem>
                    <SelectItem value="500">500 companies</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  More companies = longer processing time but more leads
                </p>
              </div>

              <div className="space-y-2">
                <Label>Target States (optional)</Label>
                <Select onValueChange={(v) => setSelectedStates([...selectedStates, v])}>
                  <SelectTrigger data-testid="select-states">
                    <SelectValue placeholder="Select states..." />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((state) => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedStates.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedStates.map((state) => (
                      <Badge 
                        key={state} 
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => setSelectedStates(selectedStates.filter(s => s !== state))}
                      >
                        {state} x
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Industry Codes (NAICS)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FAMILY_OFFICE_NAICS.map((naics) => (
                    <div key={naics.code} className="flex items-center gap-2">
                      <Checkbox
                        id={naics.code}
                        checked={selectedNaics.includes(naics.code)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedNaics([...selectedNaics, naics.code]);
                          } else {
                            setSelectedNaics(selectedNaics.filter(n => n !== naics.code));
                          }
                        }}
                        data-testid={`checkbox-naics-${naics.code}`}
                      />
                      <Label htmlFor={naics.code} className="text-sm">
                        {naics.label} ({naics.code})
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="keywords">Company Name Keywords</Label>
                <Input
                  id="keywords"
                  placeholder="family office, capital partners, private wealth"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  data-testid="input-keywords"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated keywords to match company names
                </p>
              </div>

              <div className="space-y-2">
                <Label>Target Decision Maker Titles</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {DECISION_MAKER_TITLES.map((title) => (
                    <div key={title} className="flex items-center gap-2">
                      <Checkbox
                        id={title}
                        checked={selectedTitles.includes(title)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedTitles([...selectedTitles, title]);
                          } else {
                            setSelectedTitles(selectedTitles.filter(t => t !== title));
                          }
                        }}
                        data-testid={`checkbox-title-${title.replace(/\s+/g, "-").toLowerCase()}`}
                      />
                      <Label htmlFor={title} className="text-sm">{title}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Data Sources</Label>
                <p className="text-xs text-muted-foreground">
                  Select which data sources to use for discovery and enrichment
                </p>
                
                <div className="space-y-2 border rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="useSecEdgar"
                      checked={useSecEdgar}
                      onCheckedChange={(checked) => {
                        setUseSecEdgar(!!checked);
                        if (checked) setUseOpenMart(false);
                      }}
                      data-testid="checkbox-sec-edgar"
                    />
                    <Label htmlFor="useSecEdgar" className="flex-1">
                      <span className="font-medium">SEC EDGAR</span>
                      <Badge variant="outline" className="ml-2 text-xs">FREE</Badge>
                      <span className="block text-xs text-muted-foreground">
                        13F institutional investors managing $100M+ in public equities
                      </span>
                    </Label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="useOpenMart"
                      checked={useOpenMart}
                      onCheckedChange={(checked) => {
                        setUseOpenMart(!!checked);
                        if (checked) setUseSecEdgar(false);
                      }}
                      data-testid="checkbox-openmart"
                    />
                    <Label htmlFor="useOpenMart" className="flex-1">
                      <span className="font-medium">OpenMart</span>
                      <span className="block text-xs text-muted-foreground">
                        Business leads with decision-maker contacts and roles
                      </span>
                    </Label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="useApifyInvestors"
                      checked={useApifyInvestors}
                      onCheckedChange={(checked) => setUseApifyInvestors(!!checked)}
                      data-testid="checkbox-apify-investors"
                    />
                    <Label htmlFor="useApifyInvestors" className="flex-1">
                      <span className="font-medium">Apify Startup Investors</span>
                      <span className="block text-xs text-muted-foreground">
                        9,312+ investor profiles for decision-maker enrichment
                      </span>
                    </Label>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="dataCenterFocus"
                  checked={dataCenterFocus}
                  onCheckedChange={(checked) => setDataCenterFocus(!!checked)}
                  data-testid="checkbox-datacenter-focus"
                />
                <Label htmlFor="dataCenterFocus">
                  Focus on data center / digital infrastructure interest
                </Label>
              </div>

              <Button 
                className="w-full" 
                onClick={handleCreateJob}
                disabled={createJobMutation.isPending}
                data-testid="button-start-enrichment"
              >
                {createJobMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start Enrichment
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
