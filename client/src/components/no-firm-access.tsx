import { Building2, AlertTriangle, Mail } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";

export function NoFirmAccess() {
  const { logout, isLoggingOut, user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Building2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">Freyja IQ</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => logout()}
              disabled={isLoggingOut}
              data-testid="button-logout"
            >
              {isLoggingOut ? "Signing out..." : "Sign Out"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <CardTitle className="text-xl">Account Not Associated with a Firm</CardTitle>
            <CardDescription>
              Your account ({user?.email}) is not linked to an active firm subscription.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              To access the platform, your account must be associated with a registered firm. 
              This typically happens when you sign up using a firm's signup code.
            </p>
            
            <div className="rounded-md bg-muted p-4 space-y-2">
              <p className="text-sm font-medium">What you can do:</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Contact your firm administrator for a signup code</li>
                <li>Reach out to Freyja IQ support for assistance</li>
              </ul>
            </div>
            
            <div className="flex flex-col gap-2">
              <Button 
                variant="outline" 
                className="w-full"
                asChild
                data-testid="button-contact-support"
              >
                <a href="mailto:support@freyjaiq.com">
                  <Mail className="mr-2 h-4 w-4" />
                  Contact Support
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
