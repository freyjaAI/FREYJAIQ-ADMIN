import { Phone, Mail, Copy, CheckCircle, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressScore } from "@/components/score-badge";
import type { ContactInfo } from "@shared/schema";

interface ContactCardProps {
  contacts: ContactInfo[];
  title?: string;
}

export function ContactCard({ contacts, title = "Contact Information" }: ContactCardProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (value: string, id: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const phones = contacts.filter((c) => c.kind === "phone");
  const emails = contacts.filter((c) => c.kind === "email");

  if (contacts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-4">
            No contact information available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {phones.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Phone Numbers
            </div>
            {phones.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                data-testid={`contact-phone-${contact.id}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono text-sm truncate">{contact.value}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {contact.lineType && (
                        <Badge variant="secondary" className="text-xs">
                          {contact.lineType}
                        </Badge>
                      )}
                      {contact.source && (
                        <span className="text-xs text-muted-foreground">
                          via {contact.source}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {contact.confidenceScore !== null &&
                    contact.confidenceScore !== undefined && (
                      <ProgressScore
                        score={contact.confidenceScore}
                        label="Confidence"
                        className="w-24"
                      />
                    )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(contact.value, contact.id)}
                    data-testid={`button-copy-${contact.id}`}
                  >
                    {copiedId === contact.id ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon" asChild>
                    <a href={`tel:${contact.value}`}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {emails.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Email Addresses
            </div>
            {emails.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                data-testid={`contact-email-${contact.id}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm truncate">{contact.value}</div>
                    {contact.source && (
                      <span className="text-xs text-muted-foreground">
                        via {contact.source}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {contact.confidenceScore !== null &&
                    contact.confidenceScore !== undefined && (
                      <ProgressScore
                        score={contact.confidenceScore}
                        label="Confidence"
                        className="w-24"
                      />
                    )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(contact.value, contact.id)}
                    data-testid={`button-copy-${contact.id}`}
                  >
                    {copiedId === contact.id ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon" asChild>
                    <a href={`mailto:${contact.value}`}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
