import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Calendar,
  DollarSign,
  RefreshCw,
  AlertCircle,
  Clock,
  Info,
  Building,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface MortgageMaturityPrediction {
  propertyId: string;
  mortgageRecordingDate: string | null;
  predictedMaturityDate: string | null;
  predictedTermMonths: number;
  termBucket: string;
  confidenceScore: number;
  predictionMethod: string;
  lenderName?: string;
  loanAmount?: number;
  propertyType?: string;
  reasoning?: string;
  cached?: boolean;
}

interface MortgageMaturityError {
  error: string;
  message: string;
  propertyId: string;
}

type PredictionResult = MortgageMaturityPrediction | MortgageMaturityError;

function isPredictionError(result: PredictionResult): result is MortgageMaturityError {
  return "error" in result;
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getConfidenceLabel(score: number): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } {
  if (score >= 0.5) {
    return { label: "High", variant: "default" };
  }
  if (score >= 0.4) {
    return { label: "Medium", variant: "secondary" };
  }
  return { label: "Low", variant: "outline" };
}

function getTermLabel(bucket: string): string {
  const labels: Record<string, string> = {
    "5yr": "5 Years",
    "7yr": "7 Years",
    "10yr": "10 Years",
    "15yr": "15 Years",
    "20yr": "20 Years",
    "other": "Non-Standard",
  };
  return labels[bucket] || bucket;
}

function getMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    "industry_standard": "Industry Standard",
    "ml_model": "ML Model",
    "manual": "Manual Entry",
  };
  return labels[method] || method;
}

interface MortgageMaturityCardProps {
  propertyId: string;
  isAdmin?: boolean;
}

export function MortgageMaturityCard({ propertyId, isAdmin = false }: MortgageMaturityCardProps) {
  const { toast } = useToast();

  const {
    data: prediction,
    isLoading,
    error,
    refetch,
  } = useQuery<PredictionResult>({
    queryKey: ["/api/properties", propertyId, "mortgage-maturity"],
    queryFn: async () => {
      const response = await fetch(`/api/properties/${propertyId}/mortgage-maturity`);
      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 404) {
          return errorData as MortgageMaturityError;
        }
        throw new Error(errorData.message || "Failed to fetch prediction");
      }
      return response.json();
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/properties/${propertyId}/mortgage-maturity/refresh`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "mortgage-maturity"] });
      toast({
        title: "Prediction Refreshed",
        description: "Mortgage maturity prediction has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="card-mortgage-maturity-loading">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Commercial Mortgage Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="card-mortgage-maturity-error">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Commercial Mortgage Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Unable to load mortgage data</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="mt-2"
            data-testid="button-retry-mortgage"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!prediction || isPredictionError(prediction)) {
    const errorMsg = prediction ? prediction.message : "No mortgage data available";
    return (
      <Card data-testid="card-mortgage-maturity-empty">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Commercial Mortgage Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{errorMsg}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const confidence = getConfidenceLabel(prediction.confidenceScore);
  const confidencePercent = Math.round(prediction.confidenceScore * 100);

  if (prediction.confidenceScore < 0.3) {
    return (
      <Card data-testid="card-mortgage-maturity-low-confidence">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Commercial Mortgage Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Unable to predict - insufficient data</span>
          </div>
          {prediction.lenderName && (
            <div className="mt-3 text-sm">
              <span className="text-muted-foreground">Lender: </span>
              <span>{prediction.lenderName}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-mortgage-maturity">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4" />
          Commercial Mortgage Information
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-sm">
                This is an estimated maturity date based on property and loan characteristics. Actual maturity may differ.
              </p>
            </TooltipContent>
          </Tooltip>
        </CardTitle>
        {isAdmin && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            data-testid="button-refresh-prediction"
          >
            <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs">Recording Date</span>
            </div>
            <div className="font-medium text-sm" data-testid="text-recording-date">
              {formatDate(prediction.mortgageRecordingDate)}
            </div>
          </div>

          {prediction.loanAmount && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" />
                <span className="text-xs">Loan Amount</span>
              </div>
              <div className="font-medium text-sm" data-testid="text-loan-amount">
                {formatCurrency(prediction.loanAmount)}
              </div>
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-xs">Predicted Maturity</span>
            </div>
            <Badge variant={confidence.variant} className="text-xs" data-testid="badge-confidence">
              {confidence.label} Confidence
            </Badge>
          </div>
          <div className="text-lg font-semibold" data-testid="text-maturity-date">
            {formatDate(prediction.predictedMaturityDate)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Term</span>
            <div className="font-medium text-sm" data-testid="text-term">
              {getTermLabel(prediction.termBucket)}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Confidence</span>
            <div className="flex items-center gap-2">
              <Progress value={confidencePercent} className="h-2 flex-1" />
              <span className="text-xs font-medium" data-testid="text-confidence-score">
                {confidencePercent}%
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          {prediction.lenderName && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Lender</span>
              <div className="font-medium text-sm truncate" title={prediction.lenderName} data-testid="text-lender">
                {prediction.lenderName}
              </div>
            </div>
          )}

          {prediction.propertyType && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Building className="h-3 w-3" />
                <span className="text-xs">Property Type</span>
              </div>
              <div className="font-medium text-sm capitalize" data-testid="text-property-type">
                {prediction.propertyType.replace("_", " ")}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <span>Method: {getMethodLabel(prediction.predictionMethod)}</span>
          {prediction.cached && (
            <Badge variant="outline" className="text-xs">
              Cached
            </Badge>
          )}
        </div>

        {prediction.reasoning && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-xs text-muted-foreground italic cursor-help line-clamp-2">
                {prediction.reasoning}
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              <p className="text-sm">{prediction.reasoning}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </CardContent>
    </Card>
  );
}
