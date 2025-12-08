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
}
