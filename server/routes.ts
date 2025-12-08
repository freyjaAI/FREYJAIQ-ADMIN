import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import {
  unmaskLlc,
  calculateSellerIntentScore,
  generateOutreachSuggestion,
  calculateContactConfidence,
} from "./openai";
import { dataProviders } from "./dataProviders";
import { insertOwnerSchema, insertPropertySchema, insertContactInfoSchema } from "@shared/schema";
import { z } from "zod";

function getUserId(req: any): string | null {
  return req.user?.claims?.sub || req.user?.id || null;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }
      const stats = await storage.getStats(userId);
      const recentSearches = await storage.getSearchHistory(userId, 5);
      res.json({ ...stats, recentSearches });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Search endpoint
  app.get("/api/search", isAuthenticated, async (req: any, res) => {
    try {
      const { q, type } = req.query;
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      if (!q || typeof q !== "string") {
        return res.status(400).json({ message: "Search query is required" });
      }

      let owners: any[] = [];
      let foundProperties: any[] = [];

      if (type === "owner" || type === "address") {
        owners = await storage.searchOwners(q);
        
        // Enrich with properties and contacts
        for (const owner of owners) {
          owner.properties = await storage.getPropertiesByOwner(owner.id);
          owner.contacts = await storage.getContactsByOwner(owner.id);
        }
      }

      if (type === "address" || type === "apn") {
        foundProperties = await storage.searchProperties(q);
      }

      // Log search
      await storage.createSearchHistory({
        userId,
        searchType: type as string,
        query: { q },
        resultCount: owners.length + foundProperties.length,
      });

      res.json({
        owners,
        properties: foundProperties,
        total: owners.length + foundProperties.length,
      });
    } catch (error) {
      console.error("Error searching:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // Owners endpoints
  app.get("/api/owners", isAuthenticated, async (req: any, res) => {
    try {
      const owners = await storage.getOwners();
      
      // Enrich with properties and contacts
      for (const owner of owners) {
        (owner as any).properties = await storage.getPropertiesByOwner(owner.id);
        (owner as any).contacts = await storage.getContactsByOwner(owner.id);
      }
      
      res.json(owners);
    } catch (error) {
      console.error("Error fetching owners:", error);
      res.status(500).json({ message: "Failed to fetch owners" });
    }
  });

  app.get("/api/owners/:id", isAuthenticated, async (req: any, res) => {
    try {
      const owner = await storage.getOwner(req.params.id);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }
      res.json(owner);
    } catch (error) {
      console.error("Error fetching owner:", error);
      res.status(500).json({ message: "Failed to fetch owner" });
    }
  });

  // Owner dossier endpoint
  app.get("/api/owners/:id/dossier", isAuthenticated, async (req: any, res) => {
    try {
      const owner = await storage.getOwner(req.params.id);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const properties = await storage.getPropertiesByOwner(owner.id);
      const contacts = await storage.getContactsByOwner(owner.id);
      const legalEvents = await storage.getLegalEventsByOwner(owner.id);
      const llcLinks = await storage.getLlcLinksByOwner(owner.id);

      // Enrich LLC links with owner data
      const linkedLlcs = await Promise.all(
        llcLinks.map(async (link) => {
          const llc = await storage.getOwner(link.llcOwnerId);
          return { ...link, llc };
        })
      );

      // Calculate seller intent score
      const { score, breakdown } = calculateSellerIntentScore(owner, properties, legalEvents);

      // Generate AI outreach suggestion
      let aiOutreach: string | undefined;
      try {
        aiOutreach = await generateOutreachSuggestion(owner, properties, score);
      } catch (err) {
        console.error("Error generating outreach:", err);
      }

      res.json({
        owner: { ...owner, sellerIntentScore: score },
        properties,
        contacts,
        legalEvents,
        linkedLlcs,
        aiOutreach,
        scoreBreakdown: breakdown,
      });
    } catch (error) {
      console.error("Error fetching dossier:", error);
      res.status(500).json({ message: "Failed to fetch dossier" });
    }
  });

  // Generate dossier (refresh/enrich data)
  app.post("/api/owners/:id/generate-dossier", isAuthenticated, async (req: any, res) => {
    try {
      const owner = await storage.getOwner(req.params.id);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const properties = await storage.getPropertiesByOwner(owner.id);
      const legalEvents = await storage.getLegalEventsByOwner(owner.id);

      // Calculate and update seller intent score
      const { score } = calculateSellerIntentScore(owner, properties, legalEvents);
      await storage.updateOwner(owner.id, { sellerIntentScore: score });

      // If entity, try to unmask
      if (owner.type === "entity") {
        const unmaskResult = await unmaskLlc(
          owner.name,
          undefined, // Would come from OpenCorporates in production
          owner.mailingAddress || undefined,
          owner.akaNames || undefined
        );

        if (unmaskResult.confidenceScore > 60 && unmaskResult.likelyOwner) {
          // Create or find the likely owner
          let likelyOwner = (await storage.searchOwners(unmaskResult.likelyOwner))[0];
          
          if (!likelyOwner) {
            likelyOwner = await storage.createOwner({
              name: unmaskResult.likelyOwner,
              type: "individual",
              primaryAddress: owner.primaryAddress,
            });
          }

          // Create link
          await storage.createLlcLink({
            ownerId: likelyOwner.id,
            llcOwnerId: owner.id,
            relationship: unmaskResult.relationship,
            confidenceScore: unmaskResult.confidenceScore,
            aiRationale: unmaskResult.rationale,
          });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error generating dossier:", error);
      res.status(500).json({ message: "Failed to generate dossier" });
    }
  });

  // Export PDF
  app.post("/api/owners/:id/export-pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }
      const owner = await storage.getOwner(req.params.id);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Track export
      await storage.createDossierExport({
        userId,
        ownerId: owner.id,
        format: "pdf",
      });

      // Generate PDF content (in production would use jspdf)
      const properties = await storage.getPropertiesByOwner(owner.id);
      const contacts = await storage.getContactsByOwner(owner.id);
      
      // For MVP, return a simple text representation
      const content = `
OWNER DOSSIER
=============
Name: ${owner.name}
Type: ${owner.type}
Address: ${owner.primaryAddress || "N/A"}
Seller Intent Score: ${owner.sellerIntentScore || "Not calculated"}

PROPERTIES (${properties.length})
-----------
${properties.map(p => `- ${p.address}, ${p.city} ${p.state} | Value: $${p.assessedValue?.toLocaleString() || "N/A"}`).join("\n")}

CONTACTS (${contacts.length})
---------
${contacts.map(c => `- ${c.kind}: ${c.value} (Confidence: ${c.confidenceScore}%)`).join("\n")}

Generated: ${new Date().toISOString()}
      `.trim();

      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", `attachment; filename="dossier-${owner.name.replace(/[^a-z0-9]/gi, "_")}.txt"`);
      res.send(content);
    } catch (error) {
      console.error("Error exporting PDF:", error);
      res.status(500).json({ message: "Failed to export PDF" });
    }
  });

  // Properties endpoints
  app.get("/api/properties", isAuthenticated, async (req: any, res) => {
    try {
      const properties = await storage.getProperties();
      res.json(properties);
    } catch (error) {
      console.error("Error fetching properties:", error);
      res.status(500).json({ message: "Failed to fetch properties" });
    }
  });

  app.get("/api/properties/:id", isAuthenticated, async (req: any, res) => {
    try {
      const property = await storage.getProperty(req.params.id);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      res.json(property);
    } catch (error) {
      console.error("Error fetching property:", error);
      res.status(500).json({ message: "Failed to fetch property" });
    }
  });

  // Dossier exports list
  app.get("/api/dossiers", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }
      const exports = await storage.getDossierExports(userId);
      
      // Enrich with owner data
      const enriched = await Promise.all(
        exports.map(async (exp) => {
          const owner = await storage.getOwner(exp.ownerId);
          return { ...exp, owner };
        })
      );
      
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching dossiers:", error);
      res.status(500).json({ message: "Failed to fetch dossiers" });
    }
  });

  // Seed demo data endpoint (for development)
  app.post("/api/seed-demo", isAuthenticated, async (req: any, res) => {
    try {
      // Create demo owners
      const owner1 = await storage.createOwner({
        name: "Blackstone Holdings LLC",
        type: "entity",
        primaryAddress: "345 Park Avenue, New York, NY 10154",
        mailingAddress: "345 Park Avenue, New York, NY 10154",
        riskFlags: [],
        sellerIntentScore: 35,
      });

      const owner2 = await storage.createOwner({
        name: "John Smith",
        type: "individual",
        primaryAddress: "123 Main St, Los Angeles, CA 90012",
        mailingAddress: "456 Oak Ave, Beverly Hills, CA 90210",
        riskFlags: ["tax_delinquent"],
        sellerIntentScore: 78,
      });

      const owner3 = await storage.createOwner({
        name: "Pacific Coast Properties LLC",
        type: "entity",
        primaryAddress: "800 Market St, San Francisco, CA 94102",
        riskFlags: ["lien"],
        sellerIntentScore: 62,
      });

      // Create properties
      await storage.createProperty({
        address: "100 Commercial Blvd",
        city: "New York",
        state: "NY",
        zipCode: "10001",
        apn: "123-456-789",
        propertyType: "commercial",
        units: 50,
        sqFt: 125000,
        assessedValue: 45000000,
        lastSaleDate: new Date("2018-03-15"),
        lastSalePrice: 38000000,
        yearBuilt: 1985,
        ownerId: owner1.id,
      });

      await storage.createProperty({
        address: "555 Industrial Way",
        city: "Los Angeles",
        state: "CA",
        zipCode: "90021",
        apn: "987-654-321",
        propertyType: "industrial",
        sqFt: 75000,
        assessedValue: 12000000,
        lastSaleDate: new Date("2015-07-22"),
        lastSalePrice: 8500000,
        yearBuilt: 1972,
        riskSignals: ["tax_delinquent"],
        ownerId: owner2.id,
      });

      await storage.createProperty({
        address: "222 Retail Plaza",
        city: "San Francisco",
        state: "CA",
        zipCode: "94103",
        apn: "456-789-012",
        propertyType: "commercial",
        units: 12,
        sqFt: 45000,
        assessedValue: 28000000,
        lastSaleDate: new Date("2019-11-08"),
        lastSalePrice: 24000000,
        yearBuilt: 2005,
        ownerId: owner3.id,
      });

      // Create contacts
      await storage.createContact({
        ownerId: owner1.id,
        kind: "phone",
        value: "(212) 555-1234",
        source: "public_records",
        confidenceScore: 72,
        lineType: "landline",
      });

      await storage.createContact({
        ownerId: owner1.id,
        kind: "email",
        value: "info@blackstoneholdings.com",
        source: "corporate_registry",
        confidenceScore: 85,
      });

      await storage.createContact({
        ownerId: owner2.id,
        kind: "phone",
        value: "(310) 555-9876",
        source: "IDICIA",
        confidenceScore: 91,
        lineType: "mobile",
      });

      await storage.createContact({
        ownerId: owner2.id,
        kind: "email",
        value: "jsmith@gmail.com",
        source: "TowerData",
        confidenceScore: 68,
      });

      await storage.createContact({
        ownerId: owner3.id,
        kind: "phone",
        value: "(415) 555-4567",
        source: "public_records",
        confidenceScore: 65,
        lineType: "landline",
      });

      // Create legal events
      await storage.createLegalEvent({
        ownerId: owner2.id,
        type: "lien",
        jurisdiction: "Los Angeles County",
        caseNumber: "LC-2023-45678",
        filedDate: new Date("2023-06-15"),
        status: "active",
        amount: 45000,
        description: "Property tax lien",
      });

      await storage.createLegalEvent({
        ownerId: owner3.id,
        type: "lawsuit",
        jurisdiction: "SF Superior Court",
        caseNumber: "SF-2022-12345",
        filedDate: new Date("2022-09-20"),
        status: "pending",
        description: "Tenant dispute",
      });

      // Create LLC link
      await storage.createLlcLink({
        ownerId: owner2.id,
        llcOwnerId: owner3.id,
        relationship: "manager",
        confidenceScore: 78,
        aiRationale: "Matching mailing address and registered agent patterns suggest connection.",
      });

      res.json({ success: true, message: "Demo data seeded successfully" });
    } catch (error) {
      console.error("Error seeding demo data:", error);
      res.status(500).json({ message: "Failed to seed demo data" });
    }
  });

  // Data Providers Status
  app.get("/api/data-providers/status", isAuthenticated, async (req: any, res) => {
    try {
      const available = dataProviders.getAvailableProviders();
      res.json({
        configured: available,
        all: ["attom", "opencorporates", "dataaxle", "melissa", "aleads"],
        missing: ["attom", "opencorporates", "dataaxle", "melissa", "aleads"].filter(
          (p) => !available.includes(p)
        ),
      });
    } catch (error) {
      console.error("Error checking data providers:", error);
      res.status(500).json({ message: "Failed to check data providers" });
    }
  });

  // External Property Search (ATTOM)
  app.get("/api/external/property", isAuthenticated, async (req: any, res) => {
    try {
      const { address, apn, fips } = req.query;

      if (!address && !apn) {
        return res.status(400).json({ message: "Address or APN required" });
      }

      let result;
      if (address && typeof address === "string") {
        result = await dataProviders.searchPropertyByAddress(address);
      } else if (apn && fips && typeof apn === "string" && typeof fips === "string") {
        result = await dataProviders.searchPropertyByApn(apn, fips);
      }

      if (!result) {
        return res.status(404).json({ message: "Property not found" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error searching external property:", error);
      res.status(500).json({ message: "External property search failed" });
    }
  });

  // External Owner Search (ATTOM)
  app.get("/api/external/owner-properties", isAuthenticated, async (req: any, res) => {
    try {
      const { name, state } = req.query;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Owner name required" });
      }

      const results = await dataProviders.searchPropertiesByOwner(
        name,
        typeof state === "string" ? state : undefined
      );

      res.json(results);
    } catch (error) {
      console.error("Error searching owner properties:", error);
      res.status(500).json({ message: "Owner property search failed" });
    }
  });

  // External LLC Lookup (OpenCorporates)
  app.get("/api/external/llc", isAuthenticated, async (req: any, res) => {
    try {
      const { name, state } = req.query;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Company name required" });
      }

      const result = await dataProviders.lookupLlc(
        name,
        typeof state === "string" ? state : undefined
      );

      if (!result) {
        return res.status(404).json({ message: "LLC not found" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error looking up LLC:", error);
      res.status(500).json({ message: "LLC lookup failed" });
    }
  });

  // External LLC Officers (OpenCorporates)
  app.get("/api/external/llc-officers", isAuthenticated, async (req: any, res) => {
    try {
      const { name } = req.query;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Company name required" });
      }

      const officers = await dataProviders.searchLlcOfficers(name);
      res.json(officers);
    } catch (error) {
      console.error("Error searching LLC officers:", error);
      res.status(500).json({ message: "LLC officer search failed" });
    }
  });

  // External Contact Enrichment (Data Axle + A-Leads)
  app.post("/api/external/enrich-contact", isAuthenticated, async (req: any, res) => {
    try {
      const { name, email, phone, address } = req.body;

      if (!name && !email && !phone) {
        return res.status(400).json({ message: "Name, email, or phone required" });
      }

      const result = await dataProviders.enrichContact({ name, email, phone, address });

      if (!result) {
        return res.status(404).json({ message: "Contact not found" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error enriching contact:", error);
      res.status(500).json({ message: "Contact enrichment failed" });
    }
  });

  // External Contact Search (Data Axle + A-Leads)
  app.get("/api/external/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const { name, city, state } = req.query;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Name required" });
      }

      const location =
        city || state
          ? {
              city: typeof city === "string" ? city : undefined,
              state: typeof state === "string" ? state : undefined,
            }
          : undefined;

      const results = await dataProviders.findContactsByName(name, location);
      res.json(results);
    } catch (error) {
      console.error("Error searching contacts:", error);
      res.status(500).json({ message: "Contact search failed" });
    }
  });

  // External Address Verification (Melissa)
  app.post("/api/external/verify-address", isAuthenticated, async (req: any, res) => {
    try {
      const { line1, city, state, zip } = req.body;

      if (!line1) {
        return res.status(400).json({ message: "Address line1 required" });
      }

      const result = await dataProviders.verifyAddress({ line1, city, state, zip });

      if (!result) {
        return res.status(404).json({ message: "Address verification failed" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error verifying address:", error);
      res.status(500).json({ message: "Address verification failed" });
    }
  });

  // External Person Lookup (Melissa Personator)
  app.post("/api/external/lookup-person", isAuthenticated, async (req: any, res) => {
    try {
      const { name, address, city, state, zip, email, phone } = req.body;

      if (!name && !email && !phone && !address) {
        return res.status(400).json({ message: "At least one field required" });
      }

      const result = await dataProviders.lookupPerson({
        name,
        address,
        city,
        state,
        zip,
        email,
        phone,
      });

      if (!result) {
        return res.status(404).json({ message: "Person not found" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error looking up person:", error);
      res.status(500).json({ message: "Person lookup failed" });
    }
  });

  // Google Address Validation
  app.post("/api/address/validate", isAuthenticated, async (req: any, res) => {
    try {
      const { address } = req.body;

      if (!address || typeof address !== "string") {
        return res.status(400).json({ message: "Address string required" });
      }

      const result = await dataProviders.validateAddressWithGoogle(address);

      if (!result) {
        return res.status(404).json({ message: "Address validation failed - Google provider may not be configured" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error validating address with Google:", error);
      res.status(500).json({ message: "Address validation failed" });
    }
  });

  // Google Address Autocomplete
  app.get("/api/address/autocomplete", isAuthenticated, async (req: any, res) => {
    try {
      const { input } = req.query;

      if (!input || typeof input !== "string") {
        return res.status(400).json({ message: "Input string required" });
      }

      const results = await dataProviders.getAddressAutocomplete(input);
      res.json(results);
    } catch (error) {
      console.error("Error getting address autocomplete:", error);
      res.status(500).json({ message: "Autocomplete failed" });
    }
  });

  // Google Place Details
  app.get("/api/address/place/:placeId", isAuthenticated, async (req: any, res) => {
    try {
      const { placeId } = req.params;

      if (!placeId) {
        return res.status(400).json({ message: "Place ID required" });
      }

      const result = await dataProviders.getPlaceDetails(placeId);

      if (!result) {
        return res.status(404).json({ message: "Place not found" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error getting place details:", error);
      res.status(500).json({ message: "Place lookup failed" });
    }
  });

  // Unified Search with External Data Sources
  app.post("/api/search/external", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      const { query, type } = req.body;

      if (!query || typeof query !== "string") {
        return res.status(400).json({ message: "Search query required" });
      }

      const results: any = {
        properties: [],
        owners: [],
        llcs: [],
        contacts: [],
        sources: [],
      };

      // Search properties via ATTOM
      if (type === "address" || type === "all") {
        const property = await dataProviders.searchPropertyByAddress(query);
        if (property) {
          results.properties.push(property);
          results.sources.push("attom");

          // Auto-import to local database
          const existingOwner = (await storage.searchOwners(property.ownership.ownerName))[0];
          let ownerId = existingOwner?.id;

          if (!existingOwner) {
            const newOwner = await storage.createOwner({
              name: property.ownership.ownerName,
              type: property.ownership.ownerType as "individual" | "entity",
              primaryAddress: property.ownership.mailingAddress || `${property.address.line1}, ${property.address.city}, ${property.address.state} ${property.address.zip}`,
            });
            ownerId = newOwner.id;
          }

          if (ownerId) {
            const existingProperty = (await storage.searchProperties(property.address.line1))[0];
            if (!existingProperty) {
              await storage.createProperty({
                address: property.address.line1,
                city: property.address.city,
                state: property.address.state,
                zipCode: property.address.zip,
                apn: property.parcel.apn,
                propertyType: property.building.propertyType.toLowerCase().includes("commercial") ? "commercial" : 
                              property.building.propertyType.toLowerCase().includes("industrial") ? "industrial" : "other",
                sqFt: property.building.sqft,
                yearBuilt: property.building.yearBuilt,
                assessedValue: property.assessment.assessedValue,
                ownerId,
              });
            }
          }
        }
      }

      // Search owner by name via ATTOM
      if (type === "owner" || type === "all") {
        const ownerProperties = await dataProviders.searchPropertiesByOwner(query);
        results.properties.push(...ownerProperties);
        if (ownerProperties.length > 0) {
          results.sources.push("attom");
        }
      }

      // Search LLCs via OpenCorporates
      if (type === "llc" || type === "owner" || type === "all") {
        const llc = await dataProviders.lookupLlc(query);
        if (llc) {
          results.llcs.push(llc);
          results.sources.push("opencorporates");

          // Get officers
          const officers = await dataProviders.searchLlcOfficers(query);
          results.contacts.push(
            ...officers.map((o) => ({
              name: o.name,
              title: o.position,
              company: o.companyName,
              source: "opencorporates",
            }))
          );
        }
      }

      // Search contacts via Data Axle / A-Leads
      if (type === "contact" || type === "owner" || type === "all") {
        const contacts = await dataProviders.findContactsByName(query);
        results.contacts.push(...contacts.map((c) => ({ ...c, source: "dataaxle" })));
        if (contacts.length > 0) {
          results.sources.push("dataaxle");
        }
      }

      // Log search
      await storage.createSearchHistory({
        userId,
        searchType: `external_${type}`,
        query: { q: query, type },
        resultCount:
          results.properties.length +
          results.llcs.length +
          results.contacts.length,
      });

      res.json({
        ...results,
        sources: Array.from(new Set(results.sources as string[])),
        total:
          results.properties.length +
          results.llcs.length +
          results.contacts.length,
      });
    } catch (error) {
      console.error("Error in external search:", error);
      res.status(500).json({ message: "External search failed" });
    }
  });

  // Import property from external search results
  app.post("/api/properties/import", isAuthenticated, async (req: any, res) => {
    try {
      const { property } = req.body;

      if (!property || !property.address) {
        return res.status(400).json({ message: "Property data required" });
      }

      // Check if property already exists
      const existingProperties = await storage.searchProperties(
        property.address.line1 || property.address
      );
      if (existingProperties.length > 0) {
        return res.status(409).json({ 
          message: "Property already exists",
          property: existingProperties[0]
        });
      }

      // Create owner first if provided
      let ownerId: string | undefined;
      if (property.ownership?.ownerName) {
        const ownerType = property.ownership.ownerType === "entity" ? "entity" : "individual";
        
        // Check if owner exists
        const existingOwners = await storage.searchOwners(property.ownership.ownerName);
        if (existingOwners.length > 0) {
          ownerId = existingOwners[0].id;
        } else {
          const newOwner = await storage.createOwner({
            name: property.ownership.ownerName,
            type: ownerType,
            primaryAddress: `${property.address.line1 || property.address}, ${property.address.city || ""}, ${property.address.state || ""} ${property.address.zip || ""}`.trim(),
          });
          ownerId = newOwner.id;
        }
      }

      // Create property
      const newProperty = await storage.createProperty({
        address: property.address.line1 || property.address,
        city: property.address.city || "",
        state: property.address.state || "",
        zipCode: property.address.zip || "",
        apn: property.parcel?.apn || null,
        propertyType: "other",
        sqFt: property.building?.sqft || null,
        yearBuilt: property.building?.yearBuilt || null,
        assessedValue: property.assessment?.assessedValue || null,
        marketValue: property.assessment?.marketValue || null,
        ownerId,
        metadata: {
          source: "attom",
          attomId: property.attomId,
          fips: property.parcel?.fips,
          importedAt: new Date().toISOString(),
        },
      });

      // Invalidate caches
      res.json({ 
        success: true, 
        property: newProperty,
        ownerId,
        message: "Property imported successfully"
      });
    } catch (error) {
      console.error("Error importing property:", error);
      res.status(500).json({ message: "Failed to import property" });
    }
  });

  // Auto-enrich owner with external data
  app.post("/api/owners/:id/enrich", isAuthenticated, async (req: any, res) => {
    try {
      const owner = await storage.getOwner(req.params.id);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const enrichmentResults: any = {
        properties: [],
        llc: null,
        contacts: [],
        addressVerification: null,
      };

      // Get properties from ATTOM
      const properties = await dataProviders.searchPropertiesByOwner(owner.name);
      enrichmentResults.properties = properties;

      // Import new properties
      for (const prop of properties) {
        const existing = (await storage.searchProperties(prop.address.line1))[0];
        if (!existing) {
          await storage.createProperty({
            address: prop.address.line1,
            city: prop.address.city,
            state: prop.address.state,
            zipCode: prop.address.zip,
            apn: prop.parcel.apn,
            propertyType: "other",
            sqFt: prop.building.sqft,
            yearBuilt: prop.building.yearBuilt,
            assessedValue: prop.assessment.assessedValue,
            ownerId: owner.id,
          });
        }
      }

      // Get LLC info from OpenCorporates
      if (owner.type === "entity") {
        const llc = await dataProviders.lookupLlc(owner.name);
        enrichmentResults.llc = llc;

        // Create contacts from officers
        if (llc?.officers) {
          for (const officer of llc.officers) {
            const existingContacts = await storage.getContactsByOwner(owner.id);
            const alreadyExists = existingContacts.some(
              (c) => c.value.toLowerCase().includes(officer.name.toLowerCase())
            );

            if (!alreadyExists && officer.name) {
              enrichmentResults.contacts.push({
                name: officer.name,
                position: officer.position,
                source: "opencorporates",
              });
            }
          }
        }
      }

      // Verify address with Melissa
      if (owner.primaryAddress) {
        const [line1, ...rest] = owner.primaryAddress.split(",");
        const cityStateZip = rest.join(",").trim();
        const cityMatch = cityStateZip.match(/^([^,]+),?\s*([A-Z]{2})\s*(\d{5})?/);

        if (cityMatch) {
          const verification = await dataProviders.verifyAddress({
            line1: line1.trim(),
            city: cityMatch[1]?.trim(),
            state: cityMatch[2],
            zip: cityMatch[3],
          });
          enrichmentResults.addressVerification = verification;
        }
      }

      // Get contacts from Data Axle
      const contacts = await dataProviders.findContactsByName(owner.name);
      for (const contact of contacts) {
        if (contact.phone) {
          const existing = await storage.getContactsByOwner(owner.id);
          if (!existing.some((c) => c.value === contact.phone)) {
            await storage.createContact({
              ownerId: owner.id,
              kind: "phone",
              value: contact.phone,
              source: "dataaxle",
              confidenceScore: contact.confidenceScore,
            });
          }
        }
        if (contact.email) {
          const existing = await storage.getContactsByOwner(owner.id);
          if (!existing.some((c) => c.value === contact.email)) {
            await storage.createContact({
              ownerId: owner.id,
              kind: "email",
              value: contact.email,
              source: "dataaxle",
              confidenceScore: contact.confidenceScore,
            });
          }
        }
      }
      enrichmentResults.contacts.push(...contacts);

      res.json({
        success: true,
        enrichment: enrichmentResults,
        message: "Owner enriched with external data",
      });
    } catch (error) {
      console.error("Error enriching owner:", error);
      res.status(500).json({ message: "Owner enrichment failed" });
    }
  });
}
