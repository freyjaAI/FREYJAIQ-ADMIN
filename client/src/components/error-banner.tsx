import { forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBannerProps {
  title: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  isRetrying?: boolean;
}

export const ErrorBanner = forwardRef<HTMLDivElement, ErrorBannerProps>(
  function ErrorBanner({ title, message, onRetry, onDismiss, isRetrying = false }, ref) {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="bg-destructive/10 border border-destructive/30 rounded-md p-3"
      data-testid="error-banner"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-destructive" data-testid="error-banner-title">
            {title}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5" data-testid="error-banner-message">
            {message}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onRetry && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRetry}
              disabled={isRetrying}
              className="h-7 w-7"
              data-testid="button-error-retry"
            >
              <RefreshCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDismiss}
              className="h-7 w-7"
              data-testid="button-error-dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
});

interface ErrorBannerContainerProps {
  errors: Array<{
    id: string;
    title: string;
    message: string;
    onRetry?: () => void;
  }>;
  onDismiss: (id: string) => void;
  retryingIds?: string[];
}

export function ErrorBannerContainer({
  errors,
  onDismiss,
  retryingIds = [],
}: ErrorBannerContainerProps) {
  if (errors.length === 0) return null;

  return (
    <div
      className="sticky top-0 z-50 space-y-2 mb-4"
      data-testid="error-banner-container"
    >
      <AnimatePresence mode="popLayout">
        {errors.map((error) => (
          <ErrorBanner
            key={error.id}
            title={error.title}
            message={error.message}
            onRetry={error.onRetry}
            onDismiss={() => onDismiss(error.id)}
            isRetrying={retryingIds.includes(error.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
