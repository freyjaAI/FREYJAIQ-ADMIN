#!/usr/bin/env python3
"""
OpenCorporates lookup using the opyncorporates Python wrapper.
Provides company search, company fetch, and officer lookup functionality.
"""

import json
import sys
import os
import re

try:
    from opyncorporates import create_engine
except ImportError:
    print(json.dumps({
        'success': False,
        'error': 'opyncorporates library not installed. Run: pip install opyncorporates',
    }))
    sys.exit(1)


def normalize_search_query(query):
    """
    Normalize spaced letter sequences for better search matching.
    Examples: "JOHNSTON JAKE L L C" -> "JOHNSTON JAKE LLC"
    """
    normalized = query.replace('.', '')
    normalized = re.sub(r'\b([A-Z])\s+([A-Z])\s+([A-Z])\s+([A-Z])\b', r'\1\2\3\4', normalized, flags=re.IGNORECASE)
    normalized = re.sub(r'\b([A-Z])\s+([A-Z])\s+([A-Z])\b', r'\1\2\3', normalized, flags=re.IGNORECASE)
    normalized = re.sub(r'\b([A-Z])\s+([A-Z])\b', r'\1\2', normalized, flags=re.IGNORECASE)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized


def get_engine():
    """Create OpenCorporates engine with optional API token"""
    api_token = os.environ.get('OPENCORPORATES_API_KEY')
    
    if api_token:
        return create_engine(api_version='0.4', api_token=api_token)
    else:
        return create_engine(api_version='0.4')


def is_valid_officer_name(name):
    """
    Filter out garbage/placeholder entries from OpenCorporates.
    Returns True if the name appears to be a real person/entity name.
    """
    if not name or not isinstance(name, str):
        return False
    
    name_lower = name.lower().strip()
    
    # Skip empty or very short names
    if len(name_lower) < 2:
        return False
    
    # List of garbage patterns commonly returned by OpenCorporates
    garbage_patterns = [
        'positions include',
        'information on file',
        'see document',
        'refer to',
        'available upon request',
        'not available',
        'n/a',
        'none',
        'unknown',
        'various',
        'multiple',
        'as per',
        'listed in',
        'filed with',
        'registered agent',
        'same as',
        'see above',
        'see below',
        'to be updated',
        'pending',
        'the company',
        'this company',
        'corporate officer',
        'director services',
        'nominee',
        'designated agent',
    ]
    
    for pattern in garbage_patterns:
        if pattern in name_lower:
            return False
    
    # Skip if it looks like a description rather than a name (starts with articles/prepositions)
    description_starters = ['the ', 'a ', 'an ', 'as ', 'per ', 'see ', 'for ']
    for starter in description_starters:
        if name_lower.startswith(starter):
            return False
    
    return True


def parse_officer(officer_data):
    """Parse officer data from OpenCorporates response"""
    return {
        'name': officer_data.get('name', ''),
        'position': officer_data.get('position', ''),
        'startDate': officer_data.get('start_date'),
        'endDate': officer_data.get('end_date'),
        'address': officer_data.get('address'),
        'occupation': officer_data.get('occupation'),
        'nationality': officer_data.get('nationality'),
    }


def parse_filing(filing_data):
    """Parse filing data from OpenCorporates response"""
    return {
        'title': filing_data.get('title', ''),
        'date': filing_data.get('date', ''),
        'url': filing_data.get('url'),
        'description': filing_data.get('description'),
    }


def parse_company(company_data):
    """Parse company data from OpenCorporates response"""
    if not isinstance(company_data, dict):
        return {
            'companyNumber': '',
            'name': '',
            'jurisdictionCode': '',
            'incorporationDate': None,
            'dissolutionDate': None,
            'companyType': None,
            'currentStatus': '',
            'registryUrl': None,
            'opencorporatesUrl': None,
            'registeredAddress': None,
            'agentName': None,
            'agentAddress': None,
            'branch': None,
            'officers': [],
            'filings': [],
            'previousNames': [],
            'industryCodes': [],
        }
    
    branch = None
    if company_data.get('branch') and isinstance(company_data['branch'], dict):
        branch_data = company_data['branch']
        branch = {
            'parentCompanyNumber': str(branch_data.get('company_number', '')),
            'parentJurisdictionCode': str(branch_data.get('jurisdiction_code', '')),
            'parentName': str(branch_data.get('name', '')),
            'parentOpencorporatesUrl': str(branch_data.get('opencorporates_url', '')),
        }
    
    officers = []
    if company_data.get('officers') and isinstance(company_data['officers'], list):
        for o in company_data['officers']:
            if isinstance(o, dict):
                officer = o.get('officer', o) if 'officer' in o else o
                officer_name = officer.get('name', '') if isinstance(officer, dict) else ''
                if is_valid_officer_name(officer_name):
                    officers.append(parse_officer(officer))
    
    filings = []
    if company_data.get('filings') and isinstance(company_data['filings'], list):
        for f in company_data['filings']:
            if isinstance(f, dict):
                filing = f.get('filing', f) if 'filing' in f else f
                filings.append(parse_filing(filing))
    
    previous_names = []
    if company_data.get('previous_names') and isinstance(company_data['previous_names'], list):
        for pn in company_data['previous_names']:
            if isinstance(pn, dict):
                previous_names.append(str(pn.get('company_name', '')))
            else:
                previous_names.append(str(pn))
    
    industry_codes = []
    raw_codes = company_data.get('industry_codes', [])
    if isinstance(raw_codes, list):
        for ic in raw_codes:
            if isinstance(ic, dict):
                code = ic.get('code', '') or ic.get('industry_code', {}).get('code', '')
                industry_codes.append(str(code))
            else:
                industry_codes.append(str(ic))
    
    return {
        'companyNumber': str(company_data.get('company_number', '')),
        'name': str(company_data.get('name', '')),
        'jurisdictionCode': str(company_data.get('jurisdiction_code', '')),
        'incorporationDate': company_data.get('incorporation_date'),
        'dissolutionDate': company_data.get('dissolution_date'),
        'companyType': company_data.get('company_type'),
        'currentStatus': str(company_data.get('current_status', '') or ''),
        'registryUrl': company_data.get('registry_url'),
        'opencorporatesUrl': company_data.get('opencorporates_url'),
        'registeredAddress': company_data.get('registered_address_in_full'),
        'agentName': company_data.get('agent_name'),
        'agentAddress': company_data.get('agent_address'),
        'branch': branch,
        'officers': officers,
        'filings': filings,
        'previousNames': previous_names,
        'industryCodes': industry_codes,
    }


def search_companies(query, jurisdiction=None, per_page=30):
    """
    Search for companies by name.
    Uses opyncorporates engine with caching and rate limiting.
    """
    normalized_query = normalize_search_query(query)
    
    try:
        engine = get_engine()
        
        search_args = {'q': normalized_query, 'per_page': per_page}
        if jurisdiction:
            search_args['jurisdiction_code'] = jurisdiction
        
        search = engine.search('companies', **search_args)
        
        results = search.get_page(1)
        
        companies = []
        if results:
            for item in results:
                company_data = item.get('company', item) if isinstance(item, dict) else item
                companies.append(parse_company(company_data))
        
        return {
            'success': True,
            'companies': companies,
            'totalCount': getattr(search, 'total_count', len(companies)),
            'totalPages': getattr(search, 'total_pages', 1),
            'query': query,
            'normalizedQuery': normalized_query,
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'companies': [],
            'totalCount': 0,
            'query': query,
        }


def search_officers(name, jurisdiction=None, per_page=30):
    """
    Search for corporate officers by name.
    """
    try:
        engine = get_engine()
        
        search_args = {'q': name, 'per_page': per_page}
        if jurisdiction:
            search_args['jurisdiction_code'] = jurisdiction
        
        search = engine.search('officers', **search_args)
        
        results = search.get_page(1)
        
        officers = []
        if results:
            for item in results:
                officer_data = item.get('officer', item) if isinstance(item, dict) else item
                officer_name = officer_data.get('name', '') if isinstance(officer_data, dict) else ''
                if not is_valid_officer_name(officer_name):
                    continue
                company_data = officer_data.get('company', {}) if isinstance(officer_data, dict) else {}
                officers.append({
                    'name': officer_name,
                    'position': officer_data.get('position', ''),
                    'startDate': officer_data.get('start_date'),
                    'address': officer_data.get('address'),
                    'companyName': company_data.get('name', ''),
                    'companyNumber': company_data.get('company_number', ''),
                    'jurisdictionCode': company_data.get('jurisdiction_code', ''),
                })
        
        return {
            'success': True,
            'officers': officers,
            'totalCount': getattr(search, 'total_count', len(officers)),
            'query': name,
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'officers': [],
            'totalCount': 0,
            'query': name,
        }


def get_company(jurisdiction_code, company_number):
    """
    Fetch detailed company information by jurisdiction and company number.
    """
    try:
        engine = get_engine()
        
        fetch = engine.fetch('companies', jurisdiction_code, company_number)
        
        if not fetch.results:
            return {
                'success': False,
                'error': 'Company not found',
                'company': None,
            }
        
        company = parse_company(fetch.results)
        
        return {
            'success': True,
            'company': company,
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'company': None,
        }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python opencorporates_lookup.py <command> [args]',
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    try:
        if command == 'search_companies':
            if len(sys.argv) < 3:
                print(json.dumps({'success': False, 'error': 'Missing query parameter'}))
                sys.exit(1)
            query = sys.argv[2]
            jurisdiction = sys.argv[3] if len(sys.argv) > 3 else None
            result = search_companies(query, jurisdiction)
            print(json.dumps(result))
            
        elif command == 'search_officers':
            if len(sys.argv) < 3:
                print(json.dumps({'success': False, 'error': 'Missing name parameter'}))
                sys.exit(1)
            name = sys.argv[2]
            jurisdiction = sys.argv[3] if len(sys.argv) > 3 else None
            result = search_officers(name, jurisdiction)
            print(json.dumps(result))
            
        elif command == 'get_company':
            if len(sys.argv) < 4:
                print(json.dumps({'success': False, 'error': 'Missing jurisdiction_code and company_number'}))
                sys.exit(1)
            jurisdiction_code = sys.argv[2]
            company_number = sys.argv[3]
            result = get_company(jurisdiction_code, company_number)
            print(json.dumps(result))
            
        else:
            print(json.dumps({'success': False, 'error': f'Unknown command: {command}'}))
            sys.exit(1)
            
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
