import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, Database, Eye, Trash2, Mail, Lock } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function PrivacyPolicyPage() {
  const lastUpdated = "December 17, 2024";

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-8">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-2" data-testid="text-privacy-title">
              Privacy Policy
            </h1>
            <p className="text-muted-foreground" data-testid="text-last-updated">
              Last updated: {lastUpdated}
            </p>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Introduction
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  Freyja IQ ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our commercial real estate prospecting platform.
                </p>
                <p>
                  By accessing or using Freyja IQ, you agree to the terms of this Privacy Policy. If you do not agree with our policies, please do not use our services.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-primary" />
                  Information We Collect
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <h4>Account Information</h4>
                <ul>
                  <li>Name and email address (via Replit authentication)</li>
                  <li>Profile picture (if provided through authentication provider)</li>
                  <li>Account preferences and settings</li>
                </ul>

                <h4>Usage Information</h4>
                <ul>
                  <li>Search queries and search history</li>
                  <li>Properties and owners viewed</li>
                  <li>Dossiers generated and exported</li>
                  <li>Feature usage patterns</li>
                </ul>

                <h4>Third-Party Data</h4>
                <p>
                  Our platform aggregates publicly available and licensed data from various sources to provide property ownership information, including:
                </p>
                <ul>
                  <li>Property records and assessor data</li>
                  <li>Business entity filings (LLC, corporation records)</li>
                  <li>Contact information from licensed data providers</li>
                  <li>Public records and court filings</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" />
                  How We Use Your Information
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>We use collected information to:</p>
                <ul>
                  <li>Provide and maintain our prospecting services</li>
                  <li>Process your searches and generate owner dossiers</li>
                  <li>Improve and personalize your experience</li>
                  <li>Analyze usage patterns to enhance our platform</li>
                  <li>Communicate with you about service updates</li>
                  <li>Ensure security and prevent fraud</li>
                </ul>

                <h4>AI-Generated Content</h4>
                <p>
                  Our platform uses artificial intelligence to generate certain content, including:
                </p>
                <ul>
                  <li>Seller intent scores and predictions</li>
                  <li>Suggested outreach messaging</li>
                  <li>LLC ownership analysis</li>
                  <li>Contact confidence ratings</li>
                </ul>
                <p className="text-muted-foreground italic">
                  AI-generated content is provided for informational purposes only and should be independently verified before taking any action.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-primary" />
                  Data Security
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  We implement appropriate technical and organizational measures to protect your personal information, including:
                </p>
                <ul>
                  <li>Encrypted data transmission (HTTPS/TLS)</li>
                  <li>Secure authentication via OAuth providers</li>
                  <li>Access controls and role-based permissions</li>
                  <li>Regular security audits and monitoring</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-primary" />
                  Your Rights
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>Depending on your location, you may have the following rights:</p>
                
                <h4>Access & Portability</h4>
                <p>You can request a copy of your personal data stored in our systems.</p>

                <h4>Correction</h4>
                <p>You can request correction of inaccurate personal information.</p>

                <h4>Deletion</h4>
                <p>
                  You can request deletion of your account and associated data. To delete your account, go to Settings and select "Delete Account." This will remove:
                </p>
                <ul>
                  <li>Your user account and profile</li>
                  <li>Search history</li>
                  <li>Generated dossiers and exports</li>
                  <li>Saved preferences</li>
                </ul>

                <h4>Opt-Out</h4>
                <p>You can opt out of non-essential data collection in your account settings.</p>

                <div className="mt-4 p-4 bg-muted rounded-md">
                  <p className="text-sm">
                    <strong>California Residents (CCPA):</strong> You have the right to know what personal information we collect, request deletion, and opt-out of the sale of personal information. We do not sell personal information.
                  </p>
                </div>

                <div className="mt-4 p-4 bg-muted rounded-md">
                  <p className="text-sm">
                    <strong>EU/UK Residents (GDPR):</strong> You have rights to access, rectification, erasure, restriction of processing, data portability, and to object to processing. Contact us to exercise these rights.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Data Retention</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>We retain your information as follows:</p>
                <ul>
                  <li><strong>Account data:</strong> Until you delete your account</li>
                  <li><strong>Search history:</strong> 90 days (automatically deleted)</li>
                  <li><strong>Cached dossier data:</strong> 180 days (6 months)</li>
                  <li><strong>Exported dossiers:</strong> 1 year or until manually deleted</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Third-Party Services</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>We use third-party services that may collect information:</p>
                <ul>
                  <li><strong>Authentication:</strong> Replit (OAuth provider)</li>
                  <li><strong>Data Providers:</strong> Licensed property and contact data sources</li>
                  <li><strong>AI Services:</strong> OpenAI for content generation</li>
                  <li><strong>Maps:</strong> Google Maps for property visualization</li>
                </ul>
                <p>
                  Each third-party service has its own privacy policy governing data use.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" />
                  Contact Us
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us:
                </p>
                <ul>
                  <li>Email: privacy@freyjaiq.com</li>
                  <li>Subject line: "Privacy Request - [Your Request Type]"</li>
                </ul>
                <p>
                  We will respond to verified requests within 30 days.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Changes to This Policy</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date.
                </p>
                <p>
                  Your continued use of Freyja IQ after any changes constitutes acceptance of the updated policy.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>Freyja IQ - Commercial Real Estate Intelligence Platform</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
