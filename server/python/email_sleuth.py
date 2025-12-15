#!/usr/bin/env python3
"""
Email Sleuth - Discover and verify professional emails
Inspired by buyukakyuz/email-sleuth, implemented in Python for Replit compatibility

Features:
- Pattern generation based on name + domain
- DNS/MX record lookups
- SMTP verification (when port 25 is available)
- Email scoring and ranking
"""

import sys
import json
import socket
import smtplib
import dns.resolver
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
import re


@dataclass
class EmailCandidate:
    email: str
    pattern: str
    confidence: int
    verified: Optional[bool] = None
    verification_message: str = ""


def normalize_name(name: str) -> Tuple[str, str]:
    """Extract and normalize first and last name from a full name."""
    name = name.strip().lower()
    name = re.sub(r'[^a-z\s\-]', '', name)
    parts = name.split()
    
    if len(parts) >= 2:
        first = parts[0]
        last = parts[-1]
    elif len(parts) == 1:
        first = parts[0]
        last = ""
    else:
        first = ""
        last = ""
    
    first = first.replace('-', '')
    last = last.replace('-', '')
    
    return first, last


def generate_email_patterns(first: str, last: str, domain: str) -> List[EmailCandidate]:
    """Generate common email patterns with confidence scores."""
    patterns = []
    
    if not first or not domain:
        return patterns
    
    f = first[0] if first else ""
    l = last[0] if last else ""
    
    pattern_templates = [
        (f"{first}.{last}@{domain}", "firstname.lastname", 95),
        (f"{first}{last}@{domain}", "firstnamelastname", 90),
        (f"{f}{last}@{domain}", "f.lastname", 85),
        (f"{first}_{last}@{domain}", "firstname_lastname", 80),
        (f"{first}-{last}@{domain}", "firstname-lastname", 75),
        (f"{last}.{first}@{domain}", "lastname.firstname", 70),
        (f"{f}.{last}@{domain}", "f.lastname", 65),
        (f"{first}@{domain}", "firstname", 60),
        (f"{first}{l}@{domain}", "firstnamel", 55),
        (f"{f}{l}@{domain}", "fl", 50),
    ]
    
    if last:
        for email, pattern, confidence in pattern_templates:
            if email and '@' in email and not email.startswith('@'):
                patterns.append(EmailCandidate(
                    email=email.lower(),
                    pattern=pattern,
                    confidence=confidence
                ))
    else:
        patterns.append(EmailCandidate(
            email=f"{first}@{domain}".lower(),
            pattern="firstname",
            confidence=60
        ))
    
    seen = set()
    unique_patterns = []
    for p in patterns:
        if p.email not in seen:
            seen.add(p.email)
            unique_patterns.append(p)
    
    return unique_patterns


def get_mx_records(domain: str) -> List[str]:
    """Get MX records for a domain."""
    try:
        mx_records = dns.resolver.resolve(domain, 'MX')
        return [str(r.exchange).rstrip('.') for r in sorted(mx_records, key=lambda x: x.preference)]
    except Exception:
        return []


def verify_email_smtp(email: str, mx_host: str, timeout: int = 10) -> Tuple[bool, str]:
    """
    Verify email existence via SMTP.
    Returns (verified, message) tuple.
    """
    try:
        smtp = smtplib.SMTP(timeout=timeout)
        smtp.connect(mx_host, 25)
        smtp.helo('mail.example.com')
        smtp.mail('verify@example.com')
        code, message = smtp.rcpt(email)
        smtp.quit()
        
        if code == 250:
            return True, f"SMTP verified: {message.decode()}"
        elif code == 550:
            return False, f"Email does not exist: {message.decode()}"
        else:
            return None, f"Inconclusive: {code} {message.decode()}"
    
    except smtplib.SMTPConnectError as e:
        return None, f"Connection failed: {str(e)}"
    except smtplib.SMTPServerDisconnected:
        return None, "Server disconnected"
    except socket.timeout:
        return None, "Connection timeout (port 25 may be blocked)"
    except Exception as e:
        return None, f"Verification error: {str(e)}"


def check_smtp_available(timeout: int = 5) -> bool:
    """Check if outbound SMTP port 25 is available."""
    try:
        socket.setdefaulttimeout(timeout)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('gmail-smtp-in.l.google.com', 25))
        sock.close()
        return result == 0
    except:
        return False


def discover_email(
    name: str,
    domain: str,
    verify_smtp: bool = True,
    max_verify: int = 5
) -> Dict:
    """
    Main function to discover and verify professional email.
    
    Args:
        name: Full name of the person
        domain: Company domain
        verify_smtp: Whether to attempt SMTP verification
        max_verify: Maximum number of candidates to verify
    
    Returns:
        Dict with discovered emails and best match
    """
    first, last = normalize_name(name)
    
    if not first:
        return {
            "success": False,
            "error": "Could not extract first name from input",
            "name": name,
            "domain": domain
        }
    
    domain = domain.lower().strip()
    if domain.startswith('http'):
        domain = domain.split('//')[1].split('/')[0]
    if domain.startswith('www.'):
        domain = domain[4:]
    
    candidates = generate_email_patterns(first, last, domain)
    
    if not candidates:
        return {
            "success": False,
            "error": "Could not generate email patterns",
            "name": name,
            "domain": domain
        }
    
    mx_records = get_mx_records(domain)
    has_mx = len(mx_records) > 0
    
    smtp_available = False
    if verify_smtp and has_mx:
        smtp_available = check_smtp_available()
    
    if verify_smtp and smtp_available and mx_records:
        mx_host = mx_records[0]
        for i, candidate in enumerate(candidates[:max_verify]):
            verified, message = verify_email_smtp(candidate.email, mx_host)
            candidate.verified = verified
            candidate.verification_message = message
            
            if verified is True:
                candidate.confidence = min(100, candidate.confidence + 10)
                break
            elif verified is False:
                candidate.confidence = max(0, candidate.confidence - 30)
    
    candidates.sort(key=lambda x: (
        x.verified is True,
        x.verified is None and x.verified is not False,
        x.confidence
    ), reverse=True)
    
    best_match = candidates[0] if candidates else None
    verified_emails = [c for c in candidates if c.verified is True]
    
    return {
        "success": True,
        "name": name,
        "firstName": first,
        "lastName": last,
        "domain": domain,
        "hasMxRecords": has_mx,
        "mxRecords": mx_records[:3],
        "smtpAvailable": smtp_available,
        "bestMatch": asdict(best_match) if best_match else None,
        "verifiedEmails": [asdict(e) for e in verified_emails],
        "allCandidates": [asdict(c) for c in candidates],
        "candidateCount": len(candidates)
    }


def main():
    """CLI entry point."""
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "error": "Usage: email_sleuth.py <name> <domain> [--no-verify]"
        }))
        sys.exit(1)
    
    name = sys.argv[1]
    domain = sys.argv[2]
    verify = "--no-verify" not in sys.argv
    
    result = discover_email(name, domain, verify_smtp=verify)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
