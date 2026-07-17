import assert from "node:assert/strict";
import test from "node:test";

import {
  assetFieldSectionsForType,
  assetQrcodeValue,
  assetSearchTokens,
  canTransitionAssetStatus,
  calculateAssetCompliance,
  calculateAssetHealth,
  calculateLicenceStatus,
  calculateWarrantyStatus,
  defaultAssetPrefixFromType,
  requiresDisposalDetails,
  requiresReasonForStatus,
  requiresSensitiveTransitionNote,
  tagFromPrefix,
} from "../lib/assets";
import { assetFormSchema, assetImportFormSchema, assetStatusFormSchema, assetTypeFormSchema } from "../lib/validators";

test("asset lifecycle helpers enforce the expected transitions and prompts", () => {
  assert.equal(canTransitionAssetStatus("ACTIVE", "UNDER_REPAIR"), true);
  assert.equal(canTransitionAssetStatus("DISPOSED", "ACTIVE"), false);
  assert.equal(requiresSensitiveTransitionNote("ACTIVE", "LOST"), true);
  assert.equal(requiresSensitiveTransitionNote("STOLEN", "ARCHIVED"), true);
  assert.equal(requiresReasonForStatus("LOST"), true);
  assert.equal(requiresReasonForStatus("ACTIVE"), false);
  assert.equal(requiresDisposalDetails("DISPOSED"), true);
  assert.equal(requiresDisposalDetails("RETIRED"), false);
});

test("asset identity helpers generate predictable values", () => {
  assert.equal(tagFromPrefix("LAP", 7), "LAP-00007");
  assert.equal(defaultAssetPrefixFromType("laptop"), "LAP");
  assert.equal(defaultAssetPrefixFromType("unknown"), "AST");
  assert.equal(assetQrcodeValue("https://sourcehub.local/", "asset-123"), "https://sourcehub.local/assets/asset-123");
});

test("asset search tokens normalize and deduplicate text", () => {
  const tokens = assetSearchTokens(["Dell Precision 5560", "dell", null, "Serial-123", "Serial 123"]);
  assert.deepEqual(tokens.sort(), ["123", "5560", "dell", "dell precision 5560", "precision", "serial", "serial 123", "serial-123"].sort());
});

test("asset health and warranty calculations cover the major states", () => {
  const now = new Date("2026-07-17T12:00:00Z");

  assert.equal(calculateWarrantyStatus({ expiryDate: new Date("2026-09-20T00:00:00Z") }, now), "ACTIVE");
  assert.equal(calculateWarrantyStatus({ expiryDate: new Date("2026-08-15T00:00:00Z") }, now), "EXPIRING_SOON");
  assert.equal(calculateWarrantyStatus({ expiryDate: new Date("2026-07-01T00:00:00Z") }, now), "EXPIRED");

  assert.equal(calculateLicenceStatus({ totalSeats: 10, usedSeats: 10 }, now), "FULLY_ALLOCATED");
  assert.equal(calculateLicenceStatus({ totalSeats: 10, usedSeats: 11 }, now), "OVER_ALLOCATED");
  assert.equal(calculateLicenceStatus({ status: "CANCELLED" }, now), "CANCELLED");

  assert.equal(
    calculateAssetHealth({ lastCheckIn: new Date("2026-07-16T12:00:00Z"), freeDiskSpaceGb: 25, status: "ACTIVE" }, now),
    "HEALTHY",
  );
  assert.equal(
    calculateAssetHealth({ lastCheckIn: new Date("2026-07-01T12:00:00Z"), freeDiskSpaceGb: 25, status: "ACTIVE" }, now),
    "OFFLINE",
  );
  assert.equal(calculateAssetHealth({ openCriticalTickets: 2, status: "ACTIVE" }, now), "CRITICAL");
  assert.equal(calculateAssetHealth({ freeDiskSpaceGb: 8, status: "ACTIVE" }, now), "AT_RISK");
  assert.equal(calculateAssetHealth({ maintenanceDue: true, status: "ACTIVE" }, now), "MONITOR");

  assert.equal(calculateAssetCompliance({ antivirusStatus: "ON", encryptionStatus: "ON", supportedOs: true, requiredSoftware: true, recentCheckIn: true }), "COMPLIANT");
  assert.equal(calculateAssetCompliance({ prohibitedSoftware: true }), "NON_COMPLIANT");
  assert.equal(calculateAssetCompliance({ antivirusStatus: "OFF", encryptionStatus: "ON", supportedOs: true }), "AT_RISK");
});

test("asset type sections and schemas validate expected shapes", () => {
  assert.deepEqual(assetFieldSectionsForType("laptop"), ["overview", "hardware", "network", "security", "software", "licences", "warranty", "maintenance"]);

  const assetTypeResult = assetTypeFormSchema.safeParse({
    name: "Workstation",
    description: "Office desktop",
    icon: "monitor",
    category: "Computer",
    prefix: "DESK",
    active: true,
    requiredFields: ["manufacturer", "model"],
    customFields: [
      {
        key: "assetCondition",
        label: "Asset condition",
        type: "select",
        required: true,
        options: ["New", "Used"],
        helpText: "Current physical condition.",
      },
    ],
  });
  assert.equal(assetTypeResult.success, true);

  const assetResult = assetFormSchema.safeParse({
    assetTypeId: "type-1",
    name: "Reception Laptop",
    category: "Computer",
    status: "ACTIVE",
    ownershipType: "CLIENT",
    customFields: { assetCondition: "New" },
  });
  assert.equal(assetResult.success, true);

  const badAssetTypeResult = assetTypeFormSchema.safeParse({
    name: "",
    description: "Broken type",
    icon: "x",
    category: "Computer",
    prefix: "D",
    active: true,
    requiredFields: [],
    customFields: [],
  });
  assert.equal(badAssetTypeResult.success, false);

  assert.equal(assetStatusFormSchema.safeParse({ assetId: "asset-1", status: "DISPOSED", disposalMethod: "Recycled" }).success, true);
  assert.equal(assetImportFormSchema.safeParse({ importKey: "import-1", csvContent: "name,assetTypeId\nTest,type-1" }).success, true);
});
