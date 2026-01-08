import { Link } from "wouter";
import { FileText, Shield, Scale, Database, Mail } from "lucide-react";

export function LegalFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/30 mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-wrap justify-center md:justify-start gap-4 text-sm">
            <Link 
              href="/terms" 
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-footer-terms"
            >
              <Scale className="w-3.5 h-3.5" />
              Terms of Service
            </Link>
            <Link 
              href="/privacy" 
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-footer-privacy"
            >
              <Shield className="w-3.5 h-3.5" />
              Privacy Policy
            </Link>
            <Link 
              href="/terms#acceptable-use" 
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-footer-acceptable-use"
            >
              <FileText className="w-3.5 h-3.5" />
              Acceptable Use
            </Link>
            <Link 
              href="/privacy#data-sources" 
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-footer-data-sources"
            >
              <Database className="w-3.5 h-3.5" />
              Data Sources
            </Link>
            <a 
              href="mailto:support@freyjaiq.com" 
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-footer-contact"
            >
              <Mail className="w-3.5 h-3.5" />
              Contact Us
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            {currentYear} FreyjaIQ. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
