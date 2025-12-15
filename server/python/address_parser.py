#!/usr/bin/env python3
"""
Address parsing and normalization using usaddress library.
Provides structured address parsing for US addresses.
"""

import json
import sys
import re
import usaddress

STREET_TYPE_EXPANSIONS = {
    'st': 'street',
    'ave': 'avenue',
    'blvd': 'boulevard',
    'dr': 'drive',
    'rd': 'road',
    'ln': 'lane',
    'ct': 'court',
    'pl': 'place',
    'cir': 'circle',
    'hwy': 'highway',
    'pkwy': 'parkway',
    'ter': 'terrace',
    'trl': 'trail',
    'sq': 'square',
    'way': 'way',
}

STREET_TYPE_ABBREVIATIONS = {v: k.upper() for k, v in STREET_TYPE_EXPANSIONS.items()}

DIRECTION_EXPANSIONS = {
    'n': 'north',
    's': 'south',
    'e': 'east',
    'w': 'west',
    'ne': 'northeast',
    'nw': 'northwest',
    'se': 'southeast',
    'sw': 'southwest',
}

DIRECTION_ABBREVIATIONS = {v: k.upper() for k, v in DIRECTION_EXPANSIONS.items()}

UNIT_TYPE_EXPANSIONS = {
    'apt': 'apartment',
    'ste': 'suite',
    'fl': 'floor',
    'rm': 'room',
    'unit': 'unit',
    'bldg': 'building',
}

SPACED_ABBREVIATIONS = {
    'l l c': 'LLC',
    'i n c': 'INC',
    'l p': 'LP',
    'l t d': 'LTD',
    'p c': 'PC',
    'p a': 'PA',
    'n a': 'NA',
}

def fix_spaced_letters(text):
    """Fix spaced letters like 'L L C' -> 'LLC'"""
    result = text.lower()
    for spaced, fixed in SPACED_ABBREVIATIONS.items():
        result = re.sub(r'\b' + spaced + r'\b', fixed, result, flags=re.IGNORECASE)
    return result

def normalize_street_type(street_type):
    """Normalize street type to uppercase abbreviation"""
    lower = street_type.lower().strip('.')
    if lower in STREET_TYPE_ABBREVIATIONS:
        return STREET_TYPE_ABBREVIATIONS[lower]
    if lower in STREET_TYPE_EXPANSIONS:
        return lower.upper()
    return street_type.upper()

def normalize_direction(direction):
    """Normalize direction to uppercase abbreviation"""
    lower = direction.lower().strip('.')
    if lower in DIRECTION_ABBREVIATIONS:
        return DIRECTION_ABBREVIATIONS[lower]
    if lower in DIRECTION_EXPANSIONS:
        return lower.upper()
    return direction.upper()

def parse_address(address_string):
    """
    Parse an address string into structured components.
    Returns a dictionary with parsed components and a normalized version.
    """
    if not address_string or not address_string.strip():
        return {
            'success': False,
            'error': 'Empty address string',
            'parsed': None,
            'normalized': None,
        }
    
    cleaned = fix_spaced_letters(address_string.strip())
    cleaned = re.sub(r'\s+', ' ', cleaned)
    cleaned = re.sub(r',\s*,', ',', cleaned)
    
    try:
        tagged_address, address_type = usaddress.tag(cleaned)
        
        components = {
            'addressNumber': tagged_address.get('AddressNumber', ''),
            'streetNamePreDirectional': normalize_direction(tagged_address.get('StreetNamePreDirectional', '')) if tagged_address.get('StreetNamePreDirectional') else '',
            'streetName': tagged_address.get('StreetName', '').upper() if tagged_address.get('StreetName') else '',
            'streetNamePostType': normalize_street_type(tagged_address.get('StreetNamePostType', '')) if tagged_address.get('StreetNamePostType') else '',
            'streetNamePostDirectional': normalize_direction(tagged_address.get('StreetNamePostDirectional', '')) if tagged_address.get('StreetNamePostDirectional') else '',
            'occupancyType': tagged_address.get('OccupancyType', '').upper() if tagged_address.get('OccupancyType') else '',
            'occupancyIdentifier': tagged_address.get('OccupancyIdentifier', '').upper() if tagged_address.get('OccupancyIdentifier') else '',
            'placeName': tagged_address.get('PlaceName', '').upper() if tagged_address.get('PlaceName') else '',
            'stateName': tagged_address.get('StateName', '').upper() if tagged_address.get('StateName') else '',
            'zipCode': tagged_address.get('ZipCode', ''),
            'addressType': address_type,
        }
        
        street_parts = []
        if components['addressNumber']:
            street_parts.append(components['addressNumber'])
        if components['streetNamePreDirectional']:
            street_parts.append(components['streetNamePreDirectional'])
        if components['streetName']:
            street_parts.append(components['streetName'])
        if components['streetNamePostType']:
            street_parts.append(components['streetNamePostType'])
        if components['streetNamePostDirectional']:
            street_parts.append(components['streetNamePostDirectional'])
        
        line1 = ' '.join(street_parts)
        
        line2 = ''
        if components['occupancyType'] or components['occupancyIdentifier']:
            if components['occupancyType'] and components['occupancyIdentifier']:
                line2 = f"{components['occupancyType']} {components['occupancyIdentifier']}"
            elif components['occupancyIdentifier']:
                line2 = f"#{components['occupancyIdentifier']}"
            else:
                line2 = components['occupancyType']
        
        normalized = {
            'line1': line1,
            'line2': line2,
            'city': components['placeName'],
            'stateCode': components['stateName'],
            'postalCode': components['zipCode'],
            'countryCode': 'US',
        }
        
        return {
            'success': True,
            'parsed': components,
            'normalized': normalized,
            'raw': address_string,
        }
        
    except usaddress.RepeatedLabelError as e:
        return {
            'success': False,
            'error': f'Ambiguous address: {str(e)}',
            'parsed': None,
            'normalized': None,
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'parsed': None,
            'normalized': None,
        }

def normalize_entity_name(name):
    """
    Normalize entity/owner names (fix spaced letters, consistent casing).
    """
    if not name:
        return ''
    
    normalized = fix_spaced_letters(name)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    
    words = normalized.split()
    result_words = []
    
    abbreviations = {'LLC', 'INC', 'LP', 'LTD', 'PC', 'PA', 'NA', 'CO', 'CORP'}
    
    for word in words:
        upper = word.upper()
        if upper in abbreviations:
            result_words.append(upper)
        else:
            result_words.append(word.title())
    
    return ' '.join(result_words)

def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python address_parser.py <command> <input>',
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    input_text = sys.argv[2]
    
    if command == 'parse':
        result = parse_address(input_text)
        print(json.dumps(result))
    elif command == 'normalize_name':
        result = {
            'success': True,
            'normalized': normalize_entity_name(input_text),
            'raw': input_text,
        }
        print(json.dumps(result))
    else:
        print(json.dumps({
            'success': False,
            'error': f'Unknown command: {command}',
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()
