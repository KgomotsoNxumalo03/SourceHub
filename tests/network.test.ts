import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  alertDeduplicationKey,
  buildAlertConditions,
  calculateEndpointPosture,
  detectEndpointChanges,
  endpointAuditSchema,
  matchAssetCandidates,
  resolveMonitoringPolicy,
  semverAtLeast,
} from "../lib/network.ts";
import { createRequestSignature, hashRestrictedCredential, isRequestTimestampFresh, verifyRequestSignature } from "../lib/network-security.ts";

const audit = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: "1.0",
  scriptVersion: "1.0.0",
  auditId: "11111111-1111-4111-8111-111111111111",
  timestamp: "2026-07-17T08:00:00.000Z",
  device: { computerName: "TEST-PC", loggedInUser: "tester", manufacturer: "Dell", model: "Latitude", serialNumber: "SERIAL-1", windowsDeviceId: "device-1", domainOrWorkgroup: "TEST", deviceType: "Computer" },
  operatingSystem: { edition: "Windows 11 Pro", version: "23H2", buildNumber: "22631", architecture: "64-bit", installationDate: null, lastBootTime: null, uptimeSeconds: 100, timeZone: "Africa/Johannesburg" },
  hardware: { cpuManufacturer: "Intel", cpuModel: "Core i5", physicalCores: 4, logicalProcessors: 8, totalRamBytes: 17179869184, availableRamBytes: 8589934592, memoryModules: [] },
  storage: [{ driveLetter: "C:", driveType: "Fixed", fileSystem: "NTFS", totalBytes: 100, freeBytes: 5, usedPercent: 95, health: "Healthy", bitLockerState: "On" }],
  network: { adapters: [{ name: "Ethernet", connectionType: "Ethernet", ipAddresses: ["192.0.2.10"], subnetPrefixes: ["24"], defaultGateways: ["192.0.2.1"], dnsServers: ["192.0.2.2"], dhcpEnabled: true, macAddress: "AA-BB-CC-DD-EE-FF", linkSpeed: "1 Gbps" }], publicIp: null },
  security: { antivirusProduct: "Defender", antivirusEnabled: true, antivirusUpToDate: true, firewallEnabled: true, bitLockerEnabled: true, secureBootEnabled: true, tpmPresent: true, tpmReady: true, pendingRestart: false, windowsUpdateState: "Current", localAdministrators: [] },
  software: [{ name: "App One", publisher: "Example", version: "1.0", installDate: null }],
  checkErrors: [],
  ...overrides,
});

test("endpoint audit schema rejects malformed and accepts structured audits", () => {
  assert.equal(endpointAuditSchema.safeParse(audit()).success, true);
  assert.equal(endpointAuditSchema.safeParse({ ...audit(), schemaVersion: "0.1" }).success, false);
});

test("posture and alert conditions identify security and disk failures", () => {
  const current = endpointAuditSchema.parse(audit({ storage: [{ driveLetter: "C:", driveType: "Fixed", fileSystem: "NTFS", totalBytes: 100, freeBytes: 2, usedPercent: 98, health: "Healthy", bitLockerState: "Off" }], security: { ...audit().security, antivirusEnabled: false, firewallEnabled: false, bitLockerEnabled: false } }));
  const posture = calculateEndpointPosture(current);
  assert.equal(posture.healthState, "CRITICAL");
  assert.equal(posture.complianceState, "NON_COMPLIANT");
  assert.ok(buildAlertConditions(current).some((condition) => condition.type === "CRITICAL_DISK_SPACE"));
  assert.ok(buildAlertConditions(current).some((condition) => condition.type === "ANTIVIRUS_DISABLED"));
});

test("change detection records security, hardware, IP, and software changes", () => {
  const previous = endpointAuditSchema.parse(audit());
  const current = endpointAuditSchema.parse(audit({ device: { ...previous.device, computerName: "RENAMED-PC" }, hardware: { ...previous.hardware, totalRamBytes: 34359738368 }, security: { ...previous.security, firewallEnabled: false }, network: { ...previous.network, adapters: [{ ...previous.network.adapters[0], ipAddresses: ["192.0.2.11"] }] }, software: [] }));
  const changes = detectEndpointChanges(previous, current).map((change) => change.changeType);
  assert.ok(changes.includes("COMPUTER_RENAMED"));
  assert.ok(changes.includes("RAM_CHANGED"));
  assert.ok(changes.includes("FIREWALL_STATE_CHANGED"));
  assert.ok(changes.includes("IP_ADDRESS_CHANGED"));
  assert.ok(changes.includes("SOFTWARE_REMOVED"));
});

test("asset matching stays within client and site scope and flags ambiguity", () => {
  const current = endpointAuditSchema.parse(audit());
  const result = matchAssetCandidates(current, [
    { id: "asset-one", workspaceId: "w", clientId: "c", siteId: "s", manufacturer: "Dell", serialNumber: "SERIAL-1", hostname: "TEST-PC", macAddress: "AA:BB:CC:DD:EE:FF" },
    { id: "asset-other-client", workspaceId: "w", clientId: "other", siteId: "s", manufacturer: "Dell", serialNumber: "SERIAL-1", hostname: "TEST-PC", macAddress: "AA:BB:CC:DD:EE:FF" },
  ], { workspaceId: "w", clientId: "c", siteId: "s" });
  assert.equal(result.status, "MATCHED");
  assert.equal(result.assetId, "asset-one");
});

test("policy precedence, signatures, replay freshness, and versions are deterministic", () => {
  const policy = resolveMonitoringPolicy([
    { id: "workspace", scopeType: "WORKSPACE", active: true },
    { id: "client", scopeType: "CLIENT", clientId: "c", active: true },
    { id: "site", scopeType: "SITE", clientId: "c", siteId: "s", active: true },
  ], { clientId: "c", siteId: "s" });
  assert.equal(policy?.id, "site");
  assert.equal(alertDeduplicationKey("endpoint/1", "ANTIVIRUS_DISABLED"), "endpoint-1:antivirus_disabled");
  assert.equal(semverAtLeast("1.2.0", "1.0.0"), true);
  assert.equal(semverAtLeast("0.9.0", "1.0.0"), false);
  const secret = "endpoint-secret";
  const timestamp = new Date().toISOString();
  const nonce = "nonce-1";
  const body = "{\"audit\":true}";
  const signature = createRequestSignature(secret, timestamp, nonce, body);
  assert.equal(verifyRequestSignature(secret, timestamp, nonce, body, signature), true);
  assert.equal(isRequestTimestampFresh(timestamp, 300), true);
  assert.equal(hashRestrictedCredential("token", "pepper").length, 64);
});

test("PowerShell audit is read-only and does not use Win32_Product or privileged credentials", () => {
  const script = readFileSync("public/scripts/SourceHub-WindowsAudit.ps1", "utf8");
  assert.equal(script.includes("Win32_Product"), false);
  assert.equal(script.includes("firebase-service-account"), false);
  assert.equal(script.includes("ValidateSet(\"Local\", \"Upload\")"), true);
  assert.equal(script.includes("schemaVersion"), true);
  assert.equal(script.includes("checkErrors"), true);
});
