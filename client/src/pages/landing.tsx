import { Link } from "wouter";
import { Building2, Search, Users, FileText, ArrowRight, Shield, Zap, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Landing() {
  const features = [
    {
      icon: Search,
      title: "Instant Property Search",
      description:
        "Search by address, owner name, or APN. Get results in seconds with comprehensive ownership data.",
    },
    {
      icon: Users,
      title: "LLC Unmasking",
      description:
        "AI-powered entity resolution connects LLCs to real owners with confidence scoring.",
    },
    {
      icon: Target,
      title: "Seller Intent Scoring",
      description:
        "Prioritize your outreach with data-driven seller intent scores based on property signals.",
    },
    {
      icon: FileText,
      title: "One-Click Dossiers",
      description:
        "Generate comprehensive owner profiles with contacts, properties, and AI outreach suggestions.",
    },
    {
      icon: Shield,
      title: "Contact Verification",
      description:
        "Phone and email confidence scores help you reach the right person on the first try.",
    },
    {
      icon: Zap,
      title: "10x Faster Prospecting",
      description:
        "Replace manual research with automated data enrichment and intelligent lead prioritization.",
    },
  ];

  const stats = [
    { value: "10x", label: "Faster Prospecting" },
    { value: "92%", label: "Contact Accuracy" },
    { value: "50%", label: "Cost Savings" },
    { value: "1-Click", label: "Dossier Export" },
  ];

  return (
    <div className="min-h-screen bg-gradient-premium">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary ai-glow">
              <Building2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Freyja IQ</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild className="min-h-[44px]" data-testid="button-login">
              <Link href="/login">
                Sign In
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative py-20 md:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern opacity-30" />
          <div className="container mx-auto px-4 text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-ai/30 bg-ai/10 text-sm text-ai mb-6">
              <Zap className="h-3.5 w-3.5" />
              <span>AI-Powered Intelligence</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
              CRE Prospecting,
              <br />
              <span className="bg-gradient-to-r from-primary via-ai to-ai-secondary bg-clip-text text-transparent">Supercharged</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Find property owners, unmask LLCs, and close more deals. The modern
              alternative to outdated data tools - built for commercial real estate
              professionals.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" asChild className="ai-glow" data-testid="button-get-started">
                <Link href="/login">
                  Sign In
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-border/50 hover:border-border" data-testid="button-learn-more">
                See How It Works
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t border-border/50 bg-card/50 py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-3xl font-semibold bg-gradient-to-r from-primary to-ai bg-clip-text text-transparent md:text-4xl">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 relative">
          <div className="container mx-auto px-4">
            <div className="text-center">
              <h2 className="heading-2">
                Everything You Need to Close Deals
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                Replace expensive, outdated data tools with a modern platform built
                specifically for CRE brokers.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, idx) => (
                <Card
                  key={feature.title}
                  className="hover-elevate transition-all border-border/50 bg-card/80 backdrop-blur-sm"
                >
                  <CardContent className="p-6">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-md ${
                      idx < 2 ? 'bg-ai/10' : idx < 4 ? 'bg-primary/10' : 'bg-ai-secondary/10'
                    }`}>
                      <feature.icon className={`h-5 w-5 ${
                        idx < 2 ? 'text-ai' : idx < 4 ? 'text-primary' : 'text-ai-secondary'
                      }`} />
                    </div>
                    <h3 className="mt-4 heading-4">{feature.title}</h3>
                    <p className="mt-2 body-dense text-muted-foreground">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border/50 bg-card/50 py-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern opacity-20" />
          <div className="container mx-auto px-4 text-center relative z-10">
            <h2 className="heading-2">
              Ready to Transform Your Prospecting?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Join brokers who are closing more deals with less effort.
            </p>
            <Button size="lg" className="mt-8 ai-glow" asChild data-testid="button-cta">
              <Link href="/login">
                Sign In
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 py-8 bg-card/30">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <Building2 className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium">Freyja IQ</span>
          </div>
          <p className="text-xs text-muted-foreground">
            The modern CRE prospecting platform
          </p>
        </div>
      </footer>
    </div>
  );
}
