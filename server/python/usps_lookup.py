#!/usr/bin/env python3
"""
USPS Address Validation using the official USPS Web Tools API.
Uses the usps-api Python wrapper (Brobin/usps-api) for JSON responses.
"""

import json
import sys
import os

try:
    from usps import USPSApi, Address
except ImportError:
    print(json.dumps({
        'success': False,
        'error': 'usps-api package not installed. Run: pip install usps-api',
    }))
    sys.exit(1)


def validate_address(address_1: str, city: str, state: str, zipcode: str = '', address_2: str = '', name: str = ''):
    """
    Validate and standardize a US address using USPS API.
    Returns the official USPS standardized address.
    """
    user_id = os.environ.get('USPS_USER_ID')
    if not user_id:
        return {
            'success': False,
            'error': 'USPS_USER_ID environment variable not set',
            'validated': None,
        }
    
    try:
        address = Address(
            name=name or '',
            address_1=address_1,
            address_2=address_2 or '',
            city=city,
            state=state,
            zipcode=zipcode or '',
        )
        
        usps = USPSApi(user_id, test=False)
        validation = usps.validate_address(address)
        result = validation.result
        
        if 'Error' in result.get('AddressValidateResponse', {}).get('Address', {}):
            error_info = result['AddressValidateResponse']['Address']['Error']
            return {
                'success': False,
                'error': error_info.get('Description', 'Address validation failed'),
                'errorCode': error_info.get('Number'),
                'validated': None,
            }
        
        validated_address = result.get('AddressValidateResponse', {}).get('Address', {})
        
        return {
            'success': True,
            'validated': {
                'address1': validated_address.get('Address2', ''),
                'address2': validated_address.get('Address1', ''),
                'city': validated_address.get('City', ''),
                'state': validated_address.get('State', ''),
                'zip5': validated_address.get('Zip5', ''),
                'zip4': validated_address.get('Zip4', ''),
                'zipFull': f"{validated_address.get('Zip5', '')}-{validated_address.get('Zip4', '')}" if validated_address.get('Zip4') else validated_address.get('Zip5', ''),
                'returnText': validated_address.get('ReturnText', ''),
                'dpvConfirmation': validated_address.get('DPVConfirmation', ''),
                'dpvFootnotes': validated_address.get('DPVFootnotes', ''),
            },
            'raw': {
                'address1': address_1,
                'address2': address_2,
                'city': city,
                'state': state,
                'zipcode': zipcode,
            },
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'validated': None,
        }


def parse_full_address(full_address: str):
    """
    Parse a full address string and validate with USPS.
    Attempts to split the address into components first.
    """
    import re
    
    cleaned = re.sub(r'\s+', ' ', full_address.strip())
    
    state_zip_pattern = r',?\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$'
    match = re.search(state_zip_pattern, cleaned, re.IGNORECASE)
    
    if not match:
        return {
            'success': False,
            'error': 'Could not parse state from address. Expected format: "123 Main St, City, ST 12345"',
            'validated': None,
        }
    
    state = match.group(1).upper()
    zipcode = match.group(2) or ''
    remaining = cleaned[:match.start()].strip().rstrip(',')
    
    parts = [p.strip() for p in remaining.split(',')]
    
    if len(parts) >= 2:
        city = parts[-1]
        street = ', '.join(parts[:-1])
    else:
        city_street_pattern = r'^(.+?)\s+([A-Za-z\s]+)$'
        cm = re.match(city_street_pattern, remaining)
        if cm:
            street = cm.group(1)
            city = cm.group(2)
        else:
            return {
                'success': False,
                'error': 'Could not parse city from address',
                'validated': None,
            }
    
    unit_pattern = r'\s+(APT|UNIT|STE|SUITE|#)\s*(\S+)$'
    unit_match = re.search(unit_pattern, street, re.IGNORECASE)
    address_2 = ''
    if unit_match:
        address_2 = f"{unit_match.group(1).upper()} {unit_match.group(2)}"
        street = street[:unit_match.start()].strip()
    
    return validate_address(
        address_1=street,
        address_2=address_2,
        city=city,
        state=state,
        zipcode=zipcode.replace('-', ''),
    )


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python usps_lookup.py <command> [args...]',
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'validate':
        if len(sys.argv) < 5:
            print(json.dumps({
                'success': False,
                'error': 'Usage: python usps_lookup.py validate <address1> <city> <state> [zipcode]',
            }))
            sys.exit(1)
        
        address_1 = sys.argv[2]
        city = sys.argv[3]
        state = sys.argv[4]
        zipcode = sys.argv[5] if len(sys.argv) > 5 else ''
        
        result = validate_address(address_1, city, state, zipcode)
        print(json.dumps(result))
        
    elif command == 'validate_full':
        if len(sys.argv) < 3:
            print(json.dumps({
                'success': False,
                'error': 'Usage: python usps_lookup.py validate_full "<full_address>"',
            }))
            sys.exit(1)
        
        full_address = sys.argv[2]
        result = parse_full_address(full_address)
        print(json.dumps(result))
        
    elif command == 'check':
        user_id = os.environ.get('USPS_USER_ID')
        print(json.dumps({
            'success': True,
            'configured': bool(user_id),
            'message': 'USPS API is configured' if user_id else 'USPS_USER_ID not set',
        }))
        
    else:
        print(json.dumps({
            'success': False,
            'error': f'Unknown command: {command}. Use: validate, validate_full, check',
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
