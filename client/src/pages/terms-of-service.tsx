import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, AlertTriangle, Scale, Ban, CreditCard, Gavel } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function TermsOfServicePage() {
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
            <h1 className="text-4xl font-bold tracking-tight mb-2" data-testid="text-terms-title">
              Terms of Service
            </h1>
            <p className="text-muted-foreground" data-testid="text-last-updated">
              Last updated: {lastUpdated}
            </p>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Agreement to Terms
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  By accessing or using Freyja IQ ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these Terms, you may not access the Service.
                </p>
                <p>
                  These Terms apply to all visitors, users, and others who access or use the Service.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Description of Service</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  Freyja IQ is a commercial real estate prospecting platform that provides:
                </p>
                <ul>
                  <li>Property ownership research and identification</li>
                  <li>LLC and entity ownership unmasking</li>
                  <li>Contact information aggregation</li>
                  <li>AI-powered seller intent analysis</li>
                  <li>Owner dossier generation and export</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="w-5 h-5 text-primary" />
                  Acceptable Use
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>You agree to use Freyja IQ only for lawful purposes. You must NOT use the Service:</p>
                <ul>
                  <li>To violate any applicable federal, state, local, or international law</li>
                  <li>For any purpose that violates the Fair Credit Reporting Act (FCRA), including using information for credit, employment, insurance, or tenant screening decisions</li>
                  <li>To harass, abuse, or harm another person or entity</li>
                  <li>To send unsolicited commercial communications in violation of the CAN-SPAM Act or applicable telemarketing laws</li>
                  <li>To violate Do Not Call (DNC) regulations when contacting property owners</li>
                  <li>To impersonate or attempt to impersonate the Company, an employee, another user, or any other person</li>
                  <li>To engage in any data scraping, harvesting, or similar data gathering activities</li>
                  <li>To attempt to circumvent any security features of the Service</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ban className="w-5 h-5 text-destructive" />
                  Prohibited Uses
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md mb-4">
                  <p className="font-semibold text-destructive">FCRA Notice</p>
                  <p className="text-sm">
                    Freyja IQ is NOT a consumer reporting agency as defined by the Fair Credit Reporting Act (FCRA). The data provided cannot be used to determine eligibility for credit, insurance, employment, housing, or any other purpose covered by the FCRA.
                  </p>
                </div>
                
                <p>You expressly agree NOT to use information obtained through Freyja IQ for:</p>
                <ul>
                  <li>Credit decisions or credit worthiness evaluations</li>
                  <li>Employment screening or hiring decisions</li>
                  <li>Tenant screening or rental decisions</li>
                  <li>Insurance underwriting decisions</li>
                  <li>Any purpose requiring FCRA compliance</li>
                  <li>Stalking, harassment, or threatening behavior</li>
                  <li>Identity theft or fraud</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  AI-Generated Content Disclaimer
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  Freyja IQ uses artificial intelligence to generate certain content, including but not limited to:
                </p>
                <ul>
                  <li>Seller intent scores and predictions</li>
                  <li>Outreach message suggestions</li>
                  <li>LLC ownership analysis</li>
                  <li>Contact confidence ratings</li>
                </ul>
                
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-md mt-4">
                  <p className="font-semibold">Important:</p>
                  <p className="text-sm">
                    AI-generated content is provided for informational and convenience purposes only. This content may contain errors, inaccuracies, or biases. You are solely responsible for independently verifying all AI-generated information before relying on it for any business decision or communication.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Data Accuracy</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  While we strive to provide accurate and up-to-date information, Freyja IQ makes no warranties regarding the accuracy, completeness, or timeliness of any data provided through the Service.
                </p>
                <ul>
                  <li>Property ownership records may be outdated or contain errors</li>
                  <li>Contact information may be incomplete or incorrect</li>
                  <li>LLC ownership analysis is based on available public records and may not reflect current ownership</li>
                  <li>Third-party data sources have their own limitations and update schedules</li>
                </ul>
                <p>
                  You are responsible for verifying all information independently before taking any action based on data obtained through the Service.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Intellectual Property</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  The Service and its original content (excluding data from third-party providers), features, and functionality are and will remain the exclusive property of Freyja IQ and its licensors.
                </p>
                <p>
                  You may not reproduce, distribute, modify, create derivative works of, publicly display, or exploit any content from the Service without prior written permission.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  Accounts & Subscriptions
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  When you create an account, you must provide accurate and complete information. You are responsible for safeguarding your account and for all activities under your account.
                </p>
                <ul>
                  <li>You must notify us immediately of any unauthorized use</li>
                  <li>We reserve the right to refuse service, terminate accounts, or restrict access at our sole discretion</li>
                  <li>Subscription fees, if applicable, are non-refundable unless otherwise specified</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-primary" />
                  Limitation of Liability
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, FREYJA IQ SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
                </p>
                <ul>
                  <li>Loss of profits, revenue, or business opportunities</li>
                  <li>Loss of data or goodwill</li>
                  <li>Business interruption</li>
                  <li>Any damages arising from your use of information obtained through the Service</li>
                </ul>
                <p>
                  Our total liability for any claims arising from your use of the Service shall not exceed the amount you paid us in the twelve (12) months preceding the claim.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Disclaimer of Warranties</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
                </p>
                <ul>
                  <li>Implied warranties of merchantability</li>
                  <li>Fitness for a particular purpose</li>
                  <li>Non-infringement</li>
                  <li>Accuracy, completeness, or timeliness of information</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Indemnification</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  You agree to indemnify, defend, and hold harmless Freyja IQ and its officers, directors, employees, and agents from any claims, liabilities, damages, losses, and expenses arising from:
                </p>
                <ul>
                  <li>Your use of the Service</li>
                  <li>Your violation of these Terms</li>
                  <li>Your violation of any third-party rights</li>
                  <li>Your violation of any applicable laws or regulations</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Governing Law</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions.
                </p>
                <p>
                  Any disputes arising under these Terms shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Changes to Terms</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  We reserve the right to modify or replace these Terms at any time. We will provide notice of material changes by updating the "Last updated" date and, where appropriate, notifying you via email.
                </p>
                <p>
                  Your continued use of the Service after any changes constitutes acceptance of the new Terms.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  For questions about these Terms, please contact us at:
                </p>
                <ul>
                  <li>Email: legal@freyjaiq.com</li>
                </ul>
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
