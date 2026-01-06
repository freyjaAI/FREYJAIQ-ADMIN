import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  AlertCircle,
  Loader2,
  Database,
  DollarSign,
  Percent,
  HardDrive,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";

interface TestCase {
  id: string;
  address: string;
  expectedOwnerName: string;
  expectedOwnerType: string;
  expectedContacts: { phone?: string; email?: string } | null;
  notes: string | null;
  source: string | null;
  isActive: boolean;
  createdAt: string;
}

interface TestResult {
  testCaseId: string;
  address: string;
  expectedOwner: string;
  actualOwner: string | null;
  matchStatus: string;
  providers: string[];
  cost: number;
  cacheHit: boolean;
  executionTimeMs?: number;
  error?: string;
}

interface TestMetrics {
  totalTests: number;
  exactMatches: number;
  partialMatches: number;
  mismatches: number;
  errors: number;
  exactMatchRate: string;
  partialMatchRate: string;
  mismatchRate: string;
  errorRate: string;
  totalCost: string;
  avgCostPerTest: string;
  cacheHits: number;
  cacheHitRate: string;
}

interface TestRunResponse {
  results: TestResult[];
  metrics: TestMetrics;
}

function MatchStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "exact":
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Exact
        </Badge>
      );
    case "partial":
      return (
        <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Partial
        </Badge>
      );
    case "mismatch":
      return (
        <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          Mismatch
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
          Error
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function MetricCard({ 
  title, 
  value, 
  subtext,
  icon: Icon, 
  color 
}: { 
  title: string; 
  value: string | number; 
  subtext?: string;
  icon: React.ElementType; 
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

function AddTestCaseDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    address: "",
    expectedOwnerName: "",
    expectedOwnerType: "individual",
    notes: "",
    source: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/admin/test-cases", data);
    },
    onSuccess: () => {
      toast({
        title: "Test Case Created",
        description: "New test case has been added.",
      });
      setOpen(false);
      setFormData({
        address: "",
        expectedOwnerName: "",
        expectedOwnerType: "individual",
        notes: "",
        source: "",
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-test-case">
          <Plus className="w-4 h-4 mr-2" />
          Add Test Case
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Test Case</DialogTitle>
            <DialogDescription>
              Add a property address with known owner information for validation testing.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                data-testid="input-test-address"
                placeholder="1099 SW 1st Ave, Miami, FL 33130"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expectedOwnerName">Expected Owner Name</Label>
              <Input
                id="expectedOwnerName"
                data-testid="input-expected-owner"
                placeholder="John Smith or ABC Holdings LLC"
                value={formData.expectedOwnerName}
                onChange={(e) => setFormData({ ...formData, expectedOwnerName: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expectedOwnerType">Owner Type</Label>
              <Select
                value={formData.expectedOwnerType}
                onValueChange={(value) => setFormData({ ...formData, expectedOwnerType: value })}
              >
                <SelectTrigger data-testid="select-owner-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="llc">LLC</SelectItem>
                  <SelectItem value="corporation">Corporation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="source">Verification Source</Label>
              <Input
                id="source"
                data-testid="input-source"
                placeholder="County records, title search, etc."
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                data-testid="input-notes"
                placeholder="Any special cases or notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-test-case">
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Test Case
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminTestingPage() {
  const { toast } = useToast();
  const [testResults, setTestResults] = useState<TestRunResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const { data: testCases, isLoading, refetch } = useQuery<TestCase[]>({
    queryKey: ["/api/admin/test-cases"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/test-cases/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/test-cases"] });
      toast({
        title: "Test Case Deleted",
        description: "Test case has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const runTestsMutation = useMutation({
    mutationFn: async (): Promise<TestRunResponse> => {
      setIsRunning(true);
      const response = await apiRequest("POST", "/api/admin/test-cases/run");
      return response.json();
    },
    onSuccess: (data: TestRunResponse) => {
      setTestResults(data);
      setIsRunning(false);
      toast({
        title: "Tests Complete",
        description: `Ran ${data.metrics.totalTests} tests. ${data.metrics.exactMatchRate}% exact match rate.`,
      });
    },
    onError: (error: Error) => {
      setIsRunning(false);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Property Search Testing
          </h1>
          <p className="text-muted-foreground">
            Validate search accuracy with known-good test cases
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AddTestCaseDialog onSuccess={() => refetch()} />
          <Button
            onClick={() => runTestsMutation.mutate()}
            disabled={isRunning || !testCases?.length}
            variant="default"
            data-testid="button-run-tests"
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Run All Tests
          </Button>
        </div>
      </div>

      {testResults && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Exact Match Rate"
              value={`${testResults.metrics.exactMatchRate}%`}
              subtext={`${testResults.metrics.exactMatches} of ${testResults.metrics.totalTests} tests`}
              icon={CheckCircle2}
              color="text-green-500"
            />
            <MetricCard
              title="Partial Match Rate"
              value={`${testResults.metrics.partialMatchRate}%`}
              subtext={`${testResults.metrics.partialMatches} tests`}
              icon={AlertTriangle}
              color="text-amber-500"
            />
            <MetricCard
              title="Total Cost"
              value={`$${testResults.metrics.totalCost}`}
              subtext={`$${testResults.metrics.avgCostPerTest} avg/test`}
              icon={DollarSign}
              color="text-blue-500"
            />
            <MetricCard
              title="Cache Hit Rate"
              value={`${testResults.metrics.cacheHitRate}%`}
              subtext={`${testResults.metrics.cacheHits} cache hits`}
              icon={HardDrive}
              color="text-purple-500"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Test Results</CardTitle>
              <CardDescription>
                Results from the most recent test run
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Expected Owner</TableHead>
                    <TableHead>Actual Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Providers</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Cache</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testResults.results.map((result) => (
                    <TableRow key={result.testCaseId} data-testid={`row-result-${result.testCaseId}`}>
                      <TableCell className="max-w-[200px] truncate font-medium">
                        {result.address}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {result.expectedOwner}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {result.actualOwner || <span className="text-muted-foreground italic">Not found</span>}
                      </TableCell>
                      <TableCell>
                        <MatchStatusBadge status={result.matchStatus} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {result.providers.map((p) => (
                            <Badge key={p} variant="secondary" className="text-xs">
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>${result.cost.toFixed(4)}</TableCell>
                      <TableCell>
                        {result.cacheHit ? (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            No
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Test Cases ({testCases?.length || 0})
          </CardTitle>
          <CardDescription>
            Properties with verified owner information for accuracy testing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!testCases?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No test cases yet.</p>
              <p className="text-sm">Add test cases with known owner information to start testing.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Expected Owner</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testCases.map((tc) => (
                  <TableRow key={tc.id} data-testid={`row-testcase-${tc.id}`}>
                    <TableCell className="max-w-[250px] truncate font-medium">
                      {tc.address}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {tc.expectedOwnerName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {tc.expectedOwnerType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {tc.source || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {tc.createdAt ? formatDistanceToNow(new Date(tc.createdAt), { addSuffix: true }) : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(tc.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${tc.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
