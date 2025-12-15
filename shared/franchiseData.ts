/**
 * Franchise brand detection and classification utility.
 * Helps identify franchise locations and distinguish corporate vs. franchised ownership.
 */

export interface FranchiseBrand {
  name: string;
  patterns: string[];
  parentCompany: string;
  category: "food" | "retail" | "services" | "automotive" | "hospitality" | "fitness" | "other";
  typicalCorporatePatterns: string[];
}

export const FRANCHISE_BRANDS: FranchiseBrand[] = [
  // Fast Food / QSR
  {
    name: "McDonald's",
    patterns: ["mcdonald", "mcdonalds", "mcd "],
    parentCompany: "McDonald's Corporation",
    category: "food",
    typicalCorporatePatterns: ["mcdonald's corp", "mcdonalds corp", "mcdonald's corporation", "mcdonald's usa"],
  },
  {
    name: "Subway",
    patterns: ["subway"],
    parentCompany: "Subway IP LLC",
    category: "food",
    typicalCorporatePatterns: ["subway ip", "subway development", "subway real estate"],
  },
  {
    name: "Starbucks",
    patterns: ["starbucks"],
    parentCompany: "Starbucks Corporation",
    category: "food",
    typicalCorporatePatterns: ["starbucks corp", "starbucks corporation", "starbucks coffee"],
  },
  {
    name: "Burger King",
    patterns: ["burger king", "bk "],
    parentCompany: "Restaurant Brands International",
    category: "food",
    typicalCorporatePatterns: ["burger king corp", "rbi", "restaurant brands"],
  },
  {
    name: "Wendy's",
    patterns: ["wendy's", "wendys"],
    parentCompany: "The Wendy's Company",
    category: "food",
    typicalCorporatePatterns: ["wendy's corp", "wendys company", "wendy's international"],
  },
  {
    name: "Taco Bell",
    patterns: ["taco bell"],
    parentCompany: "Yum! Brands",
    category: "food",
    typicalCorporatePatterns: ["yum brands", "yum! brands", "taco bell corp"],
  },
  {
    name: "KFC",
    patterns: ["kfc", "kentucky fried"],
    parentCompany: "Yum! Brands",
    category: "food",
    typicalCorporatePatterns: ["yum brands", "yum! brands", "kfc corp"],
  },
  {
    name: "Pizza Hut",
    patterns: ["pizza hut"],
    parentCompany: "Yum! Brands",
    category: "food",
    typicalCorporatePatterns: ["yum brands", "yum! brands", "pizza hut corp"],
  },
  {
    name: "Chick-fil-A",
    patterns: ["chick-fil-a", "chickfila", "chick fil a"],
    parentCompany: "Chick-fil-A, Inc.",
    category: "food",
    typicalCorporatePatterns: ["chick-fil-a inc", "chick-fil-a corp", "cfa properties"],
  },
  {
    name: "Domino's",
    patterns: ["domino's", "dominos"],
    parentCompany: "Domino's Pizza, Inc.",
    category: "food",
    typicalCorporatePatterns: ["domino's pizza inc", "dominos corp"],
  },
  {
    name: "Dunkin'",
    patterns: ["dunkin", "dunkin'"],
    parentCompany: "Inspire Brands",
    category: "food",
    typicalCorporatePatterns: ["inspire brands", "dunkin brands", "dunkin' corp"],
  },
  {
    name: "Popeyes",
    patterns: ["popeyes", "popeye's"],
    parentCompany: "Restaurant Brands International",
    category: "food",
    typicalCorporatePatterns: ["rbi", "restaurant brands", "popeyes corp"],
  },
  {
    name: "Chipotle",
    patterns: ["chipotle"],
    parentCompany: "Chipotle Mexican Grill",
    category: "food",
    typicalCorporatePatterns: ["chipotle mexican grill", "cmg"],
  },
  {
    name: "Panera Bread",
    patterns: ["panera"],
    parentCompany: "Panera Brands",
    category: "food",
    typicalCorporatePatterns: ["panera brands", "panera bread company"],
  },
  {
    name: "Sonic",
    patterns: ["sonic drive-in", "sonic drive in"],
    parentCompany: "Inspire Brands",
    category: "food",
    typicalCorporatePatterns: ["inspire brands", "sonic corp"],
  },
  {
    name: "Arby's",
    patterns: ["arby's", "arbys"],
    parentCompany: "Inspire Brands",
    category: "food",
    typicalCorporatePatterns: ["inspire brands", "arby's corp"],
  },
  {
    name: "Papa John's",
    patterns: ["papa john's", "papa johns"],
    parentCompany: "Papa John's International",
    category: "food",
    typicalCorporatePatterns: ["papa john's international", "papa johns corp"],
  },
  {
    name: "Little Caesars",
    patterns: ["little caesars", "little caesar's"],
    parentCompany: "Ilitch Holdings",
    category: "food",
    typicalCorporatePatterns: ["ilitch holdings", "little caesars corp"],
  },
  {
    name: "Jimmy John's",
    patterns: ["jimmy john's", "jimmy johns"],
    parentCompany: "Inspire Brands",
    category: "food",
    typicalCorporatePatterns: ["inspire brands", "jimmy john's corp"],
  },
  {
    name: "Jersey Mike's",
    patterns: ["jersey mike's", "jersey mikes"],
    parentCompany: "Jersey Mike's Franchise Systems",
    category: "food",
    typicalCorporatePatterns: ["jersey mike's franchise", "jersey mike's corp"],
  },
  {
    name: "Firehouse Subs",
    patterns: ["firehouse subs"],
    parentCompany: "Restaurant Brands International",
    category: "food",
    typicalCorporatePatterns: ["rbi", "restaurant brands", "firehouse corp"],
  },
  {
    name: "Wingstop",
    patterns: ["wingstop"],
    parentCompany: "Wingstop Inc.",
    category: "food",
    typicalCorporatePatterns: ["wingstop inc", "wingstop corp"],
  },
  {
    name: "Five Guys",
    patterns: ["five guys"],
    parentCompany: "Five Guys Enterprises",
    category: "food",
    typicalCorporatePatterns: ["five guys enterprises", "five guys corp"],
  },
  {
    name: "Raising Cane's",
    patterns: ["raising cane's", "raising canes"],
    parentCompany: "Raising Cane's Restaurants",
    category: "food",
    typicalCorporatePatterns: ["raising cane's restaurants", "raising cane's corp"],
  },
  {
    name: "Culver's",
    patterns: ["culver's", "culvers"],
    parentCompany: "Culver Franchising System",
    category: "food",
    typicalCorporatePatterns: ["culver franchising", "culver's corp"],
  },
  {
    name: "Dairy Queen",
    patterns: ["dairy queen", "dq "],
    parentCompany: "International Dairy Queen",
    category: "food",
    typicalCorporatePatterns: ["international dairy queen", "american dairy queen", "berkshire hathaway"],
  },
  {
    name: "Panda Express",
    patterns: ["panda express"],
    parentCompany: "Panda Restaurant Group",
    category: "food",
    typicalCorporatePatterns: ["panda restaurant group", "panda express inc"],
  },
  {
    name: "Waffle House",
    patterns: ["waffle house"],
    parentCompany: "Waffle House Inc.",
    category: "food",
    typicalCorporatePatterns: ["waffle house inc", "waffle house corp"],
  },
  {
    name: "IHOP",
    patterns: ["ihop", "international house of pancakes"],
    parentCompany: "Dine Brands",
    category: "food",
    typicalCorporatePatterns: ["dine brands", "ihop corp"],
  },
  {
    name: "Applebee's",
    patterns: ["applebee's", "applebees"],
    parentCompany: "Dine Brands",
    category: "food",
    typicalCorporatePatterns: ["dine brands", "applebee's corp"],
  },
  {
    name: "Buffalo Wild Wings",
    patterns: ["buffalo wild wings", "bww"],
    parentCompany: "Inspire Brands",
    category: "food",
    typicalCorporatePatterns: ["inspire brands", "buffalo wild wings corp"],
  },
  {
    name: "Denny's",
    patterns: ["denny's", "dennys"],
    parentCompany: "Denny's Corporation",
    category: "food",
    typicalCorporatePatterns: ["denny's corporation", "dennys corp"],
  },
  {
    name: "Cracker Barrel",
    patterns: ["cracker barrel"],
    parentCompany: "Cracker Barrel Old Country Store",
    category: "food",
    typicalCorporatePatterns: ["cracker barrel old country", "cbrl group"],
  },
  {
    name: "Texas Roadhouse",
    patterns: ["texas roadhouse"],
    parentCompany: "Texas Roadhouse, Inc.",
    category: "food",
    typicalCorporatePatterns: ["texas roadhouse inc", "texas roadhouse corp"],
  },
  {
    name: "Olive Garden",
    patterns: ["olive garden"],
    parentCompany: "Darden Restaurants",
    category: "food",
    typicalCorporatePatterns: ["darden restaurants", "darden corp"],
  },
  {
    name: "Red Lobster",
    patterns: ["red lobster"],
    parentCompany: "Red Lobster Hospitality",
    category: "food",
    typicalCorporatePatterns: ["red lobster hospitality", "darden restaurants"],
  },
  {
    name: "Outback Steakhouse",
    patterns: ["outback steakhouse", "outback "],
    parentCompany: "Bloomin' Brands",
    category: "food",
    typicalCorporatePatterns: ["bloomin' brands", "bloomin brands", "osi restaurant"],
  },
  {
    name: "Chili's",
    patterns: ["chili's", "chilis"],
    parentCompany: "Brinker International",
    category: "food",
    typicalCorporatePatterns: ["brinker international", "chili's corp"],
  },
  {
    name: "TGI Friday's",
    patterns: ["tgi friday's", "tgi fridays", "friday's"],
    parentCompany: "TGI Friday's Inc.",
    category: "food",
    typicalCorporatePatterns: ["tgi friday's inc", "fridays corp"],
  },
  
  // Convenience / Retail
  {
    name: "7-Eleven",
    patterns: ["7-eleven", "7 eleven", "7eleven"],
    parentCompany: "Seven & I Holdings",
    category: "retail",
    typicalCorporatePatterns: ["7-eleven inc", "seven & i", "southland corp"],
  },
  {
    name: "Circle K",
    patterns: ["circle k"],
    parentCompany: "Alimentation Couche-Tard",
    category: "retail",
    typicalCorporatePatterns: ["couche-tard", "circle k stores", "circle k corp"],
  },
  {
    name: "Wawa",
    patterns: ["wawa"],
    parentCompany: "Wawa, Inc.",
    category: "retail",
    typicalCorporatePatterns: ["wawa inc", "wawa corp"],
  },
  {
    name: "Sheetz",
    patterns: ["sheetz"],
    parentCompany: "Sheetz, Inc.",
    category: "retail",
    typicalCorporatePatterns: ["sheetz inc", "sheetz corp"],
  },
  {
    name: "QuikTrip",
    patterns: ["quiktrip", "qt "],
    parentCompany: "QuikTrip Corporation",
    category: "retail",
    typicalCorporatePatterns: ["quiktrip corp", "quiktrip corporation"],
  },
  {
    name: "Casey's",
    patterns: ["casey's", "caseys"],
    parentCompany: "Casey's General Stores",
    category: "retail",
    typicalCorporatePatterns: ["casey's general stores", "casey's corp"],
  },
  {
    name: "Dollar General",
    patterns: ["dollar general"],
    parentCompany: "Dollar General Corporation",
    category: "retail",
    typicalCorporatePatterns: ["dollar general corp", "dg corp"],
  },
  {
    name: "Dollar Tree",
    patterns: ["dollar tree"],
    parentCompany: "Dollar Tree, Inc.",
    category: "retail",
    typicalCorporatePatterns: ["dollar tree inc", "dollar tree corp"],
  },
  {
    name: "Family Dollar",
    patterns: ["family dollar"],
    parentCompany: "Dollar Tree, Inc.",
    category: "retail",
    typicalCorporatePatterns: ["dollar tree inc", "family dollar corp"],
  },
  {
    name: "AutoZone",
    patterns: ["autozone"],
    parentCompany: "AutoZone, Inc.",
    category: "automotive",
    typicalCorporatePatterns: ["autozone inc", "autozone corp"],
  },
  {
    name: "O'Reilly Auto Parts",
    patterns: ["o'reilly", "oreilly auto"],
    parentCompany: "O'Reilly Automotive",
    category: "automotive",
    typicalCorporatePatterns: ["o'reilly automotive", "oreilly corp"],
  },
  {
    name: "Advance Auto Parts",
    patterns: ["advance auto"],
    parentCompany: "Advance Auto Parts, Inc.",
    category: "automotive",
    typicalCorporatePatterns: ["advance auto parts inc", "advance auto corp"],
  },
  {
    name: "NAPA Auto Parts",
    patterns: ["napa auto"],
    parentCompany: "Genuine Parts Company",
    category: "automotive",
    typicalCorporatePatterns: ["genuine parts company", "napa inc"],
  },
  {
    name: "Jiffy Lube",
    patterns: ["jiffy lube"],
    parentCompany: "Shell Oil Company",
    category: "automotive",
    typicalCorporatePatterns: ["shell oil", "jiffy lube international"],
  },
  {
    name: "Valvoline",
    patterns: ["valvoline"],
    parentCompany: "Valvoline Inc.",
    category: "automotive",
    typicalCorporatePatterns: ["valvoline inc", "valvoline corp"],
  },
  {
    name: "Midas",
    patterns: ["midas"],
    parentCompany: "Midas International",
    category: "automotive",
    typicalCorporatePatterns: ["midas international", "midas corp"],
  },
  {
    name: "Meineke",
    patterns: ["meineke"],
    parentCompany: "Driven Brands",
    category: "automotive",
    typicalCorporatePatterns: ["driven brands", "meineke corp"],
  },
  {
    name: "Maaco",
    patterns: ["maaco"],
    parentCompany: "Driven Brands",
    category: "automotive",
    typicalCorporatePatterns: ["driven brands", "maaco corp"],
  },
  {
    name: "Take 5 Oil Change",
    patterns: ["take 5 oil", "take five oil"],
    parentCompany: "Driven Brands",
    category: "automotive",
    typicalCorporatePatterns: ["driven brands", "take 5 corp"],
  },
  
  // Hotels / Hospitality
  {
    name: "Marriott",
    patterns: ["marriott"],
    parentCompany: "Marriott International",
    category: "hospitality",
    typicalCorporatePatterns: ["marriott international", "marriott corp"],
  },
  {
    name: "Hilton",
    patterns: ["hilton"],
    parentCompany: "Hilton Worldwide",
    category: "hospitality",
    typicalCorporatePatterns: ["hilton worldwide", "hilton hotels corp"],
  },
  {
    name: "Holiday Inn",
    patterns: ["holiday inn"],
    parentCompany: "InterContinental Hotels Group",
    category: "hospitality",
    typicalCorporatePatterns: ["ihg", "intercontinental hotels"],
  },
  {
    name: "Hampton Inn",
    patterns: ["hampton inn", "hampton by hilton"],
    parentCompany: "Hilton Worldwide",
    category: "hospitality",
    typicalCorporatePatterns: ["hilton worldwide", "hilton corp"],
  },
  {
    name: "Best Western",
    patterns: ["best western"],
    parentCompany: "Best Western Hotels & Resorts",
    category: "hospitality",
    typicalCorporatePatterns: ["best western international", "best western corp"],
  },
  {
    name: "Comfort Inn",
    patterns: ["comfort inn", "comfort suites"],
    parentCompany: "Choice Hotels",
    category: "hospitality",
    typicalCorporatePatterns: ["choice hotels", "choice international"],
  },
  {
    name: "Quality Inn",
    patterns: ["quality inn"],
    parentCompany: "Choice Hotels",
    category: "hospitality",
    typicalCorporatePatterns: ["choice hotels", "choice international"],
  },
  {
    name: "Days Inn",
    patterns: ["days inn"],
    parentCompany: "Wyndham Hotels & Resorts",
    category: "hospitality",
    typicalCorporatePatterns: ["wyndham hotels", "wyndham corp"],
  },
  {
    name: "Super 8",
    patterns: ["super 8"],
    parentCompany: "Wyndham Hotels & Resorts",
    category: "hospitality",
    typicalCorporatePatterns: ["wyndham hotels", "wyndham corp"],
  },
  {
    name: "La Quinta",
    patterns: ["la quinta"],
    parentCompany: "Wyndham Hotels & Resorts",
    category: "hospitality",
    typicalCorporatePatterns: ["wyndham hotels", "la quinta corp"],
  },
  {
    name: "Motel 6",
    patterns: ["motel 6"],
    parentCompany: "G6 Hospitality",
    category: "hospitality",
    typicalCorporatePatterns: ["g6 hospitality", "motel 6 corp"],
  },
  {
    name: "Extended Stay",
    patterns: ["extended stay"],
    parentCompany: "Extended Stay America",
    category: "hospitality",
    typicalCorporatePatterns: ["extended stay america", "esa management"],
  },
  
  // Services
  {
    name: "UPS Store",
    patterns: ["ups store", "the ups store"],
    parentCompany: "United Parcel Service",
    category: "services",
    typicalCorporatePatterns: ["ups", "united parcel service"],
  },
  {
    name: "FedEx Office",
    patterns: ["fedex office", "fedex kinkos"],
    parentCompany: "FedEx Corporation",
    category: "services",
    typicalCorporatePatterns: ["fedex corp", "federal express"],
  },
  {
    name: "H&R Block",
    patterns: ["h&r block", "hr block"],
    parentCompany: "H&R Block, Inc.",
    category: "services",
    typicalCorporatePatterns: ["h&r block inc", "h&r block corp"],
  },
  {
    name: "Jackson Hewitt",
    patterns: ["jackson hewitt"],
    parentCompany: "Jackson Hewitt Tax Service",
    category: "services",
    typicalCorporatePatterns: ["jackson hewitt tax", "jackson hewitt corp"],
  },
  {
    name: "Liberty Tax",
    patterns: ["liberty tax"],
    parentCompany: "Nextpoint Financial",
    category: "services",
    typicalCorporatePatterns: ["nextpoint financial", "liberty tax service"],
  },
  {
    name: "Great Clips",
    patterns: ["great clips"],
    parentCompany: "Great Clips, Inc.",
    category: "services",
    typicalCorporatePatterns: ["great clips inc", "great clips corp"],
  },
  {
    name: "Sport Clips",
    patterns: ["sport clips"],
    parentCompany: "Sport Clips, Inc.",
    category: "services",
    typicalCorporatePatterns: ["sport clips inc", "sport clips corp"],
  },
  {
    name: "Supercuts",
    patterns: ["supercuts"],
    parentCompany: "Regis Corporation",
    category: "services",
    typicalCorporatePatterns: ["regis corp", "regis corporation"],
  },
  {
    name: "Massage Envy",
    patterns: ["massage envy"],
    parentCompany: "Massage Envy Franchising",
    category: "services",
    typicalCorporatePatterns: ["massage envy franchising", "massage envy corp"],
  },
  {
    name: "European Wax Center",
    patterns: ["european wax"],
    parentCompany: "European Wax Center, Inc.",
    category: "services",
    typicalCorporatePatterns: ["european wax center inc", "ewc corp"],
  },
  {
    name: "Orangetheory Fitness",
    patterns: ["orangetheory", "orange theory"],
    parentCompany: "Orangetheory Fitness Franchising",
    category: "fitness",
    typicalCorporatePatterns: ["orangetheory franchising", "otf corp"],
  },
  {
    name: "Planet Fitness",
    patterns: ["planet fitness"],
    parentCompany: "Planet Fitness, Inc.",
    category: "fitness",
    typicalCorporatePatterns: ["planet fitness inc", "planet fitness corp"],
  },
  {
    name: "Anytime Fitness",
    patterns: ["anytime fitness"],
    parentCompany: "Self Esteem Brands",
    category: "fitness",
    typicalCorporatePatterns: ["self esteem brands", "anytime fitness corp"],
  },
  {
    name: "Gold's Gym",
    patterns: ["gold's gym", "golds gym"],
    parentCompany: "RSG Group",
    category: "fitness",
    typicalCorporatePatterns: ["rsg group", "gold's gym international"],
  },
  {
    name: "Snap Fitness",
    patterns: ["snap fitness"],
    parentCompany: "Lift Brands",
    category: "fitness",
    typicalCorporatePatterns: ["lift brands", "snap fitness corp"],
  },
  {
    name: "F45",
    patterns: ["f45 ", "f45 training"],
    parentCompany: "F45 Training Holdings",
    category: "fitness",
    typicalCorporatePatterns: ["f45 training holdings", "f45 corp"],
  },
  {
    name: "LA Fitness",
    patterns: ["la fitness"],
    parentCompany: "Fitness International",
    category: "fitness",
    typicalCorporatePatterns: ["fitness international", "la fitness corp"],
  },
  {
    name: "YMCA",
    patterns: ["ymca", "y.m.c.a"],
    parentCompany: "YMCA of the USA",
    category: "fitness",
    typicalCorporatePatterns: ["ymca of the usa", "ymca corp"],
  },
  {
    name: "CrossFit",
    patterns: ["crossfit"],
    parentCompany: "CrossFit, LLC",
    category: "fitness",
    typicalCorporatePatterns: ["crossfit llc", "crossfit inc"],
  },
  {
    name: "Servpro",
    patterns: ["servpro"],
    parentCompany: "Servpro Industries",
    category: "services",
    typicalCorporatePatterns: ["servpro industries", "servpro corp"],
  },
  {
    name: "ServiceMaster",
    patterns: ["servicemaster"],
    parentCompany: "ServiceMaster Brands",
    category: "services",
    typicalCorporatePatterns: ["servicemaster brands", "servicemaster corp"],
  },
  {
    name: "Molly Maid",
    patterns: ["molly maid"],
    parentCompany: "Neighborly",
    category: "services",
    typicalCorporatePatterns: ["neighborly", "molly maid corp"],
  },
  {
    name: "Two Men and a Truck",
    patterns: ["two men and a truck"],
    parentCompany: "Two Men and a Truck International",
    category: "services",
    typicalCorporatePatterns: ["two men and a truck international", "tmt franchising"],
  },
  {
    name: "Ace Hardware",
    patterns: ["ace hardware"],
    parentCompany: "Ace Hardware Corporation",
    category: "retail",
    typicalCorporatePatterns: ["ace hardware corp", "ace hardware corporation"],
  },
  {
    name: "True Value",
    patterns: ["true value"],
    parentCompany: "True Value Company",
    category: "retail",
    typicalCorporatePatterns: ["true value company", "true value corp"],
  },
];

export type FranchiseOwnershipType = "corporate" | "franchised" | "unknown";

export interface FranchiseAnalysis {
  isFranchise: boolean;
  brand: FranchiseBrand | null;
  ownershipType: FranchiseOwnershipType;
  confidence: "high" | "medium" | "low";
  explanation: string;
}

/**
 * Detect if a property name or business name matches a known franchise brand.
 */
export function detectFranchiseBrand(name: string): FranchiseBrand | null {
  if (!name) return null;
  
  const nameLower = name.toLowerCase().trim();
  
  for (const brand of FRANCHISE_BRANDS) {
    for (const pattern of brand.patterns) {
      if (nameLower.includes(pattern.toLowerCase())) {
        return brand;
      }
    }
  }
  
  return null;
}

/**
 * Determine if the owner appears to be a corporate parent or a franchisee.
 */
export function analyzeOwnership(
  ownerName: string,
  brand: FranchiseBrand
): { ownershipType: FranchiseOwnershipType; confidence: "high" | "medium" | "low" } {
  const ownerLower = ownerName.toLowerCase().trim();
  
  // Check if owner matches corporate patterns
  for (const pattern of brand.typicalCorporatePatterns) {
    if (ownerLower.includes(pattern.toLowerCase())) {
      return { ownershipType: "corporate", confidence: "high" };
    }
  }
  
  // Check if owner is exactly the brand name (likely corporate)
  for (const pattern of brand.patterns) {
    if (ownerLower === pattern.toLowerCase() || 
        ownerLower === `${pattern.toLowerCase()} corp` ||
        ownerLower === `${pattern.toLowerCase()} corporation` ||
        ownerLower === `${pattern.toLowerCase()} inc`) {
      return { ownershipType: "corporate", confidence: "high" };
    }
  }
  
  // Check for LLC/Inc patterns that suggest a franchisee
  const franchiseePatterns = [
    /llc$/i,
    /l\.l\.c\.?$/i,
    /inc$/i,
    /incorporated$/i,
    /enterprises$/i,
    /holdings$/i,
    /group$/i,
    /partners$/i,
    /investments$/i,
    /properties$/i,
    /management$/i,
    /ventures$/i,
  ];
  
  // If owner name contains brand name + LLC/Inc pattern, likely franchisee
  const hasBrandMatch = brand.patterns.some(p => ownerLower.includes(p.toLowerCase()));
  const hasFranchiseePattern = franchiseePatterns.some(p => p.test(ownerLower));
  
  if (hasBrandMatch && hasFranchiseePattern) {
    // Has brand name but also looks like an independent entity
    // Check if it's NOT a known corporate pattern
    const isCorporate = brand.typicalCorporatePatterns.some(p => 
      ownerLower.includes(p.toLowerCase())
    );
    
    if (!isCorporate) {
      return { ownershipType: "franchised", confidence: "medium" };
    }
  }
  
  // If owner name doesn't contain brand name at all, likely franchisee
  if (!hasBrandMatch) {
    // Individual names or unrelated LLCs owning franchise locations are franchisees
    const isIndividualName = /^[a-z]+\s+[a-z]+(\s+[a-z]+)?$/i.test(ownerName.trim());
    
    if (isIndividualName) {
      return { ownershipType: "franchised", confidence: "high" };
    }
    
    return { ownershipType: "franchised", confidence: "medium" };
  }
  
  return { ownershipType: "unknown", confidence: "low" };
}

/**
 * Perform full franchise analysis on a property/owner combination.
 */
export function analyzeFranchise(
  propertyName: string | null,
  ownerName: string,
  ownerType: "individual" | "entity"
): FranchiseAnalysis {
  // Try to detect brand from property name first, then owner name
  let brand = propertyName ? detectFranchiseBrand(propertyName) : null;
  if (!brand) {
    brand = detectFranchiseBrand(ownerName);
  }
  
  if (!brand) {
    return {
      isFranchise: false,
      brand: null,
      ownershipType: "unknown",
      confidence: "high",
      explanation: "Not identified as a franchise location",
    };
  }
  
  // Analyze ownership type
  const { ownershipType, confidence } = analyzeOwnership(ownerName, brand);
  
  // Generate explanation
  let explanation = "";
  if (ownershipType === "corporate") {
    explanation = `This appears to be a corporate-owned ${brand.name} location. The property is likely owned directly by ${brand.parentCompany} or a corporate subsidiary.`;
  } else if (ownershipType === "franchised") {
    if (ownerType === "individual") {
      explanation = `This appears to be a franchised ${brand.name} location owned by an individual franchisee.`;
    } else {
      explanation = `This appears to be a franchised ${brand.name} location. The owner may be a multi-unit franchise operator.`;
    }
  } else {
    explanation = `This is a ${brand.name} location but ownership type could not be determined with certainty.`;
  }
  
  return {
    isFranchise: true,
    brand,
    ownershipType,
    confidence,
    explanation,
  };
}
