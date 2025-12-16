import { useState, useEffect, useCallback } from "react";
import html2canvas from "html2canvas";
import { MessageSquare, X, RefreshCw, Bug, Lightbulb, HelpCircle, ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type IssueType = "bug" | "feature" | "question";

const issueTypes: { type: IssueType; icon: typeof Bug; label: string }[] = [
  { type: "bug", icon: Bug, label: "Bug" },
  { type: "feature", icon: Lightbulb, label: "Feature" },
  { type: "question", icon: HelpCircle, label: "Question" },
];

export function BugReportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [issueType, setIssueType] = useState<IssueType>("bug");
  const [isCapturing, setIsCapturing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const captureScreenshot = useCallback(async () => {
    setIsCapturing(true);
    try {
      // Hide the FAB temporarily for cleaner screenshot
      const fab = document.getElementById("bug-report-fab");
      if (fab) fab.style.visibility = "hidden";

      const canvas = await html2canvas(document.body, {
        backgroundColor: "#0a0a0f",
        scale: 0.75,
        logging: false,
        useCORS: true,
        allowTaint: true,
      });

      if (fab) fab.style.visibility = "visible";

      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      setScreenshot(dataUrl);
    } catch (error) {
      console.error("Failed to capture screenshot:", error);
      toast({
        title: "Screenshot failed",
        description: "Could not capture the screen. You can still submit without it.",
        variant: "destructive",
      });
    } finally {
      setIsCapturing(false);
    }
  }, [toast]);

  const handleOpen = async () => {
    setIsOpen(true);
    await captureScreenshot();
  };

  const submitMutation = useMutation({
    mutationFn: async (data: {
      description: string;
      issueType: string;
      screenshot: string | null;
      pageUrl: string;
      userAgent: string;
      viewport: string;
    }) => {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to submit");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Report submitted",
        description: "Thanks! We received your report and will look into it soon.",
      });
      handleClose();
    },
    onError: () => {
      toast({
        title: "Submission failed",
        description: "Could not submit the report. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!description.trim()) {
      toast({
        title: "Description required",
        description: "Please describe the issue before submitting.",
        variant: "destructive",
      });
      return;
    }

    submitMutation.mutate({
      description: description.trim(),
      issueType,
      screenshot,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    setScreenshot(null);
    setDescription("");
    setIssueType("bug");
    setShowDetails(false);
  };

  // Keyboard shortcut: Ctrl/Cmd + Shift + B
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (!isOpen) {
          handleOpen();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isOpen]);

  return (
    <>
      {/* Floating Action Button */}
      <button
        id="bug-report-fab"
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-[9999] flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-lg shadow-violet-500/40 transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-violet-500/50 active:scale-95"
        aria-label="Report an issue"
        data-testid="button-bug-report"
      >
        <MessageSquare className="h-6 w-6" />
      </button>

      {/* Beta Badge */}
      <div className="fixed top-4 right-16 z-50">
        <Badge variant="outline" className="bg-violet-500/20 border-violet-500/50 text-violet-300 gap-1">
          <Sparkles className="h-3 w-3" />
          BETA
        </Badge>
      </div>

      {/* Bug Report Modal */}
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-[600px] bg-zinc-900/98 backdrop-blur-xl border-white/10 rounded-3xl p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-3 text-lg">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              Report an Issue
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-5">
            {/* Screenshot preview */}
            {isCapturing ? (
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-muted/20 h-40 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                  <span className="text-sm text-muted-foreground">Capturing screen...</span>
                </div>
              </div>
            ) : screenshot ? (
              <div className="relative rounded-xl overflow-hidden border border-white/10">
                <img
                  src={screenshot}
                  alt="Screenshot"
                  className="w-full opacity-80 hover:opacity-100 transition-opacity"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute top-2 right-2 h-8 gap-1"
                  onClick={captureScreenshot}
                >
                  <RefreshCw className="h-3 w-3" />
                  Retake
                </Button>
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-muted/20 h-40 flex items-center justify-center">
                <Button variant="secondary" onClick={captureScreenshot}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Capture Screenshot
                </Button>
              </div>
            )}

            {/* Description */}
            <Textarea
              placeholder="What went wrong? The more detail, the better..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-none bg-muted/30 border-white/10 focus:border-violet-500/50"
              data-testid="input-bug-description"
            />

            {/* Issue type selector */}
            <div className="flex gap-2">
              {issueTypes.map(({ type, icon: Icon, label }) => (
                <Button
                  key={type}
                  variant={issueType === type ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "flex-1 gap-2",
                    issueType === type
                      ? "bg-violet-500 hover:bg-violet-600"
                      : "border-white/10 hover:border-white/20"
                  )}
                  onClick={() => setIssueType(type)}
                  data-testid={`button-issue-type-${type}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>

            {/* Technical details (collapsible) */}
            <Collapsible open={showDetails} onOpenChange={setShowDetails}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
                  Technical details
                  <ChevronDown className={cn("h-4 w-4 transition-transform", showDetails && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="rounded-xl bg-muted/20 border border-white/5 p-4 text-xs font-mono space-y-1 text-muted-foreground">
                  <p><span className="text-foreground/70">Page:</span> {window.location.pathname}</p>
                  <p><span className="text-foreground/70">Browser:</span> {navigator.userAgent.split(" ").slice(-2).join(" ")}</p>
                  <p><span className="text-foreground/70">User:</span> {user?.email || "Not logged in"}</p>
                  <p><span className="text-foreground/70">Viewport:</span> {window.innerWidth}x{window.innerHeight}</p>
                  <p><span className="text-foreground/70">Time:</span> {new Date().toISOString()}</p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 pt-0">
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending || !description.trim()}
              className="bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600"
              data-testid="button-submit-bug-report"
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Report"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
