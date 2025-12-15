#!/usr/bin/env python3
"""
HomeHarvest Property Lookup Script
Called by Node.js server to fetch property data from Realtor.com
Returns JSON to stdout for parsing by the Node.js process
"""

import sys
import json
from homeharvest import scrape_property


def lookup_property_by_address(address: str) -> dict:
    """
    Look up a property by its address using HomeHarvest.
    Returns property data in a standardized format.
    """
    try:
        properties = scrape_property(
            location=address,
            listing_type=None,
            extra_property_data=True,
        )
        
        if properties.empty:
            return {"success": False, "error": "No property found", "data": None}
        
        prop = properties.iloc[0]
        
        result = {
            "success": True,
            "data": {
                "address": {
                    "street": str(prop.get("street_address", "") or ""),
                    "city": str(prop.get("city", "") or ""),
                    "state": str(prop.get("state", "") or ""),
                    "zipCode": str(prop.get("zip_code", "") or ""),
                    "fullAddress": str(prop.get("full_address", "") or address),
                },
                "property": {
                    "propertyType": str(prop.get("property_type", "") or ""),
                    "style": str(prop.get("style", "") or ""),
                    "beds": int(prop.get("beds", 0) or 0) if prop.get("beds") else None,
                    "baths": float(prop.get("baths", 0) or 0) if prop.get("baths") else None,
                    "sqft": int(prop.get("sqft", 0) or 0) if prop.get("sqft") else None,
                    "lotSqft": int(prop.get("lot_sqft", 0) or 0) if prop.get("lot_sqft") else None,
                    "yearBuilt": int(prop.get("year_built", 0) or 0) if prop.get("year_built") else None,
                    "stories": int(prop.get("stories", 0) or 0) if prop.get("stories") else None,
                    "parkingGarage": int(prop.get("parking_garage", 0) or 0) if prop.get("parking_garage") else None,
                },
                "pricing": {
                    "listPrice": int(prop.get("list_price", 0) or 0) if prop.get("list_price") else None,
                    "soldPrice": int(prop.get("sold_price", 0) or 0) if prop.get("sold_price") else None,
                    "pricePerSqft": int(prop.get("price_per_sqft", 0) or 0) if prop.get("price_per_sqft") else None,
                    "estimatedValue": int(prop.get("estimated_value", 0) or 0) if prop.get("estimated_value") else None,
                    "taxAssessedValue": int(prop.get("tax_assessed_value", 0) or 0) if prop.get("tax_assessed_value") else None,
                },
                "listing": {
                    "status": str(prop.get("status", "") or ""),
                    "listDate": str(prop.get("list_date", "") or ""),
                    "soldDate": str(prop.get("sold_date", "") or ""),
                    "lastSoldDate": str(prop.get("last_sold_date", "") or ""),
                    "daysOnMls": int(prop.get("days_on_mls", 0) or 0) if prop.get("days_on_mls") else None,
                    "mlsId": str(prop.get("mls_id", "") or ""),
                    "mlsNumber": str(prop.get("mls", "") or ""),
                },
                "agent": {
                    "name": str(prop.get("agent_name", "") or ""),
                    "phone": str(prop.get("agent_phone", "") or ""),
                    "email": str(prop.get("agent_email", "") or ""),
                },
                "broker": {
                    "name": str(prop.get("broker_name", "") or ""),
                    "phone": str(prop.get("broker_phone", "") or ""),
                },
                "hoa": {
                    "fee": int(prop.get("hoa_fee", 0) or 0) if prop.get("hoa_fee") else None,
                },
                "location": {
                    "latitude": float(prop.get("latitude", 0) or 0) if prop.get("latitude") else None,
                    "longitude": float(prop.get("longitude", 0) or 0) if prop.get("longitude") else None,
                    "neighborhoods": str(prop.get("neighborhoods", "") or ""),
                },
                "source": "homeharvest",
                "propertyUrl": str(prop.get("property_url", "") or ""),
            }
        }
        
        return result
        
    except Exception as e:
        return {"success": False, "error": str(e), "data": None}


def search_properties_by_location(location: str, listing_type: str = "for_sale", limit: int = 10) -> dict:
    """
    Search for properties in a location (city, zip code, etc.)
    Returns list of properties.
    """
    try:
        listing_type_map = {
            "for_sale": "for_sale",
            "for_rent": "for_rent",
            "sold": "sold",
            "pending": "pending",
        }
        
        lt = listing_type_map.get(listing_type, "for_sale")
        
        properties = scrape_property(
            location=location,
            listing_type=lt,
        )
        
        if properties.empty:
            return {"success": True, "data": [], "count": 0}
        
        results = []
        for _, prop in properties.head(limit).iterrows():
            results.append({
                "address": str(prop.get("full_address", "") or ""),
                "street": str(prop.get("street_address", "") or ""),
                "city": str(prop.get("city", "") or ""),
                "state": str(prop.get("state", "") or ""),
                "zipCode": str(prop.get("zip_code", "") or ""),
                "propertyType": str(prop.get("property_type", "") or ""),
                "beds": int(prop.get("beds", 0) or 0) if prop.get("beds") else None,
                "baths": float(prop.get("baths", 0) or 0) if prop.get("baths") else None,
                "sqft": int(prop.get("sqft", 0) or 0) if prop.get("sqft") else None,
                "listPrice": int(prop.get("list_price", 0) or 0) if prop.get("list_price") else None,
                "status": str(prop.get("status", "") or ""),
                "yearBuilt": int(prop.get("year_built", 0) or 0) if prop.get("year_built") else None,
                "latitude": float(prop.get("latitude", 0) or 0) if prop.get("latitude") else None,
                "longitude": float(prop.get("longitude", 0) or 0) if prop.get("longitude") else None,
            })
        
        return {"success": True, "data": results, "count": len(results)}
        
    except Exception as e:
        return {"success": False, "error": str(e), "data": [], "count": 0}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: homeharvest_lookup.py <command> <args>"}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "lookup":
        address = sys.argv[2]
        result = lookup_property_by_address(address)
        print(json.dumps(result))
    elif command == "search":
        location = sys.argv[2]
        listing_type = sys.argv[3] if len(sys.argv) > 3 else "for_sale"
        limit = int(sys.argv[4]) if len(sys.argv) > 4 else 10
        result = search_properties_by_location(location, listing_type, limit)
        print(json.dumps(result))
    else:
        print(json.dumps({"success": False, "error": f"Unknown command: {command}"}))
        sys.exit(1)
