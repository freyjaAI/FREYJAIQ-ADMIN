import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Building2, ArrowRight, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

interface FirmValidation {
  firmId: string;
  firmName: string;
}

export default function Signup() {
  const [, setLocation] = useLocation();
  const { register, isRegistering } = useAuth();
  const { toast } = useToast();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [debouncedCode, setDebouncedCode] = useState("");
  
  // Pre-fill signup code from URL query parameter (for invitation links)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get("code");
    if (codeFromUrl) {
      setSignupCode(codeFromUrl.toUpperCase());
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCode(signupCode.trim().toUpperCase());
    }, 500);
    return () => clearTimeout(timer);
  }, [signupCode]);

  const { data: firmValidation, isLoading: isValidating, error: validationError } = useQuery<FirmValidation>({
    queryKey: ["/api/auth/validate-signup-code", debouncedCode],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: debouncedCode.length >= 4,
    retry: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!firmValidation) {
      toast({
        title: "Invalid signup code",
        description: "Please enter a valid firm signup code",
        variant: "destructive",
      });
      return;
    }
    
    try {
      await register({ 
        email, 
        password, 
        firstName: firstName || undefined, 
        lastName: lastName || undefined,
        signupCode: signupCode.trim().toUpperCase(),
      });
      toast({
        title: "Account created",
        description: `Welcome to ${firmValidation.firmName}!`,
      });
      setLocation("/");
    } catch (error: any) {
      toast({
        title: "Signup failed",
        description: error?.message || "Could not create account",
        variant: "destructive",
      });
    }
  };

  const isCodeValid = !!firmValidation && !validationError;
  const showCodeStatus = debouncedCode.length >= 4;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Building2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">Freyja IQ</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Create Account</CardTitle>
            <CardDescription>
              Sign up with your firm's code to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    data-testid="input-last-name"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    data-testid="input-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signupCode">Firm Signup Code</Label>
                <div className="relative">
                  <Input
                    id="signupCode"
                    type="text"
                    placeholder="Enter your firm's code"
                    value={signupCode}
                    onChange={(e) => setSignupCode(e.target.value.toUpperCase())}
                    required
                    className="uppercase font-mono"
                    data-testid="input-signup-code"
                  />
                  {showCodeStatus && !isValidating && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isCodeValid ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-destructive" />
                      )}
                    </div>
                  )}
                </div>
                {showCodeStatus && !isValidating && (
                  <p className={`text-sm ${isCodeValid ? "text-green-600 dark:text-green-400" : "text-destructive"}`} data-testid="text-firm-status">
                    {isCodeValid 
                      ? `You're joining: ${firmValidation?.firmName}` 
                      : "Invalid signup code"}
                  </p>
                )}
                {isValidating && debouncedCode.length >= 4 && (
                  <p className="text-sm text-muted-foreground">Validating code...</p>
                )}
              </div>
              
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isRegistering || !isCodeValid}
                data-testid="button-signup-submit"
              >
                {isRegistering ? "Creating account..." : "Create Account"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
