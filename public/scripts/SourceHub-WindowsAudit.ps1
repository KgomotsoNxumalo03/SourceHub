#requires -Version 5.1
<#
.SYNOPSIS
  Source IT Services read-only Windows endpoint audit.
.DESCRIPTION
  Collects hardware, operating-system, storage, network, security, and installed
  software inventory. It does not collect passwords, browser history, documents,
  or file contents and does not make system changes.
#>
[CmdletBinding()]
param(
  [ValidateSet("Local", "Upload")]
  [string]$Mode = "Local",
  [string]$OutputPath = ".\SourceHub-Audit.json",
  [string]$SourceHubUrl = "http://localhost:3000",
  [string]$EnrollmentToken = "",
  [string]$EndpointId = "",
  [string]$EndpointCredential = "",
  [switch]$IncludePublicIp,
  [string]$ApprovedPublicIpService = "https://api.ipify.org"
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$ScriptVersion = "1.0.0"
$SchemaVersion = "1.0"
$AuditId = [guid]::NewGuid().ToString()
$CheckErrors = New-Object System.Collections.Generic.List[object]

function Add-CheckError {
  param([string]$Check, [System.Exception]$Exception, [bool]$RequiresAdmin = $false)
  $CheckErrors.Add([ordered]@{
    check = $Check
    message = $Exception.Message
    requiresAdmin = $RequiresAdmin
  })
}

function Invoke-SafeCheck {
  param([string]$Name, [scriptblock]$Script, $Fallback = $null, [bool]$RequiresAdmin = $false)
  try { return & $Script } catch { Add-CheckError -Check $Name -Exception $_.Exception -RequiresAdmin $RequiresAdmin; return $Fallback }
}

function Convert-CimDate {
  param($Value)
  if ($null -eq $Value) { return $null }
  try { return ([datetime]$Value).ToUniversalTime().ToString("o") } catch { return $null }
}

function Get-InstalledSoftware {
  $paths = @(
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  $items = foreach ($path in $paths) {
    Get-ItemProperty -Path $path -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
      [ordered]@{
        name = [string]$_.DisplayName
        publisher = if ($_.Publisher) { [string]$_.Publisher } else { $null }
        version = if ($_.DisplayVersion) { [string]$_.DisplayVersion } else { $null }
        installDate = if ($_.InstallDate) { [string]$_.InstallDate } else { $null }
      }
    }
  }
  return @($items | Sort-Object name, publisher -Unique)
}

function Get-HmacSignature {
  param([string]$Secret, [string]$Timestamp, [string]$Nonce, [string]$Body)
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  try {
    $hmac.Key = [Text.Encoding]::UTF8.GetBytes($Secret)
    $bytes = [Text.Encoding]::UTF8.GetBytes("$Timestamp.$Nonce.$Body")
    return ([BitConverter]::ToString($hmac.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally { $hmac.Dispose() }
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$IsAdministrator = Test-IsAdministrator
$ComputerSystem = Invoke-SafeCheck "computer-system" { Get-CimInstance -ClassName Win32_ComputerSystem }
$Bios = Invoke-SafeCheck "bios" { Get-CimInstance -ClassName Win32_BIOS }
$OperatingSystem = Invoke-SafeCheck "operating-system" { Get-CimInstance -ClassName Win32_OperatingSystem }
$Processor = Invoke-SafeCheck "processor" { Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1 }
$MemoryModules = Invoke-SafeCheck "memory-modules" {
  @(Get-CimInstance -ClassName Win32_PhysicalMemory | ForEach-Object {
    [ordered]@{
      capacityBytes = if ($_.Capacity) { [double]$_.Capacity } else { $null }
      manufacturer = if ($_.Manufacturer) { [string]$_.Manufacturer.Trim() } else { $null }
      partNumber = if ($_.PartNumber) { [string]$_.PartNumber.Trim() } else { $null }
    }
  })
} @()

$BitLockerByMount = @{}
Invoke-SafeCheck "bitlocker" {
  if (Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue) {
    Get-BitLockerVolume | ForEach-Object { $BitLockerByMount[$_.MountPoint] = [string]$_.ProtectionStatus }
  }
} $null $true | Out-Null

$Storage = Invoke-SafeCheck "storage" {
  @(Get-CimInstance -ClassName Win32_LogicalDisk | ForEach-Object {
    $total = if ($_.Size) { [double]$_.Size } else { $null }
    $free = if ($_.FreeSpace) { [double]$_.FreeSpace } else { $null }
    $used = if ($total -and $total -gt 0 -and $null -ne $free) { [math]::Round((($total - $free) / $total) * 100, 2) } else { $null }
    [ordered]@{
      driveLetter = [string]$_.DeviceID
      driveType = [string]$_.DriveType
      fileSystem = if ($_.FileSystem) { [string]$_.FileSystem } else { $null }
      totalBytes = $total
      freeBytes = $free
      usedPercent = $used
      health = $null
      bitLockerState = if ($BitLockerByMount.ContainsKey([string]$_.DeviceID)) { $BitLockerByMount[[string]$_.DeviceID] } else { $null }
    }
  })
} @()

$NetworkAdapters = Invoke-SafeCheck "network-adapters" {
  @(Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq "Up" } | ForEach-Object {
    $configuration = $_
    [ordered]@{
      name = [string]$configuration.InterfaceAlias
      connectionType = [string]$configuration.NetAdapter.MediaType
      ipAddresses = @($configuration.AllIPAddresses | ForEach-Object { [string]$_ })
      subnetPrefixes = @($configuration.IPv4Address | ForEach-Object { [string]$_.PrefixLength })
      defaultGateways = @($configuration.IPv4DefaultGateway | ForEach-Object { [string]$_.NextHop })
      dnsServers = @($configuration.DNSServer.ServerAddresses | ForEach-Object { [string]$_ })
      dhcpEnabled = [bool]$configuration.NetIPv4Interface.Dhcp
      macAddress = [string]$configuration.NetAdapter.MacAddress
      linkSpeed = [string]$configuration.NetAdapter.LinkSpeed
    }
  })
} @()

$Antivirus = Invoke-SafeCheck "antivirus" {
  Get-CimInstance -Namespace "root\SecurityCenter2" -ClassName AntiVirusProduct | Select-Object -First 1
} $null
$FirewallProfiles = Invoke-SafeCheck "firewall" { @(Get-NetFirewallProfile) } @()
$SecureBoot = Invoke-SafeCheck "secure-boot" { [bool](Confirm-SecureBootUEFI) } $null $true
$Tpm = Invoke-SafeCheck "tpm" { if (Get-Command Get-Tpm -ErrorAction SilentlyContinue) { Get-Tpm } else { $null } } $null $true
$PendingRestart = Invoke-SafeCheck "pending-restart" {
  (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending") -or
  (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired")
} $null
$LocalAdministrators = Invoke-SafeCheck "local-administrators" {
  $group = [ADSI]"WinNT://./Administrators,group"
  @($group.psbase.Invoke("Members") | ForEach-Object { $_.GetType().InvokeMember("Name", "GetProperty", $null, $_, $null) })
} @() $true
$InstalledSoftware = Invoke-SafeCheck "installed-software" { Get-InstalledSoftware } @()
$PublicIp = $null
if ($IncludePublicIp) {
  $PublicIp = Invoke-SafeCheck "public-ip" { (Invoke-RestMethod -Uri $ApprovedPublicIpService -Method Get -TimeoutSec 10).ToString().Trim() } $null
}

$LastBoot = if ($OperatingSystem -and $OperatingSystem.LastBootUpTime) { [datetime]$OperatingSystem.LastBootUpTime } else { $null }
$UptimeSeconds = if ($LastBoot) { [math]::Max(0, [math]::Floor(((Get-Date) - $LastBoot).TotalSeconds)) } else { $null }
$WindowsDeviceId = Invoke-SafeCheck "windows-device-id" { (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Cryptography").MachineGuid } $null $true

$Audit = [ordered]@{
  schemaVersion = $SchemaVersion
  scriptVersion = $ScriptVersion
  auditId = $AuditId
  timestamp = (Get-Date).ToUniversalTime().ToString("o")
  device = [ordered]@{
    computerName = [Environment]::MachineName
    loggedInUser = [Environment]::UserName
    manufacturer = if ($ComputerSystem) { [string]$ComputerSystem.Manufacturer } else { $null }
    model = if ($ComputerSystem) { [string]$ComputerSystem.Model } else { $null }
    serialNumber = if ($Bios) { [string]$Bios.SerialNumber } else { $null }
    windowsDeviceId = if ($WindowsDeviceId) { [string]$WindowsDeviceId } else { $null }
    domainOrWorkgroup = if ($ComputerSystem) { [string]$ComputerSystem.Domain } else { $null }
    deviceType = if ($ComputerSystem -and $ComputerSystem.PCSystemType -eq 2) { "Laptop" } else { "Computer" }
  }
  operatingSystem = [ordered]@{
    edition = if ($OperatingSystem) { [string]$OperatingSystem.Caption } else { $null }
    version = if ($OperatingSystem) { [string]$OperatingSystem.Version } else { $null }
    buildNumber = if ($OperatingSystem) { [string]$OperatingSystem.BuildNumber } else { $null }
    architecture = if ($OperatingSystem) { [string]$OperatingSystem.OSArchitecture } else { $null }
    installationDate = if ($OperatingSystem) { Convert-CimDate $OperatingSystem.InstallDate } else { $null }
    lastBootTime = if ($LastBoot) { $LastBoot.ToUniversalTime().ToString("o") } else { $null }
    uptimeSeconds = $UptimeSeconds
    timeZone = [TimeZoneInfo]::Local.Id
  }
  hardware = [ordered]@{
    cpuManufacturer = if ($Processor) { [string]$Processor.Manufacturer } else { $null }
    cpuModel = if ($Processor) { [string]$Processor.Name } else { $null }
    physicalCores = if ($Processor) { [int]$Processor.NumberOfCores } else { $null }
    logicalProcessors = if ($Processor) { [int]$Processor.NumberOfLogicalProcessors } else { $null }
    totalRamBytes = if ($ComputerSystem) { [double]$ComputerSystem.TotalPhysicalMemory } else { $null }
    availableRamBytes = if ($OperatingSystem) { [double]$OperatingSystem.FreePhysicalMemory * 1024 } else { $null }
    memoryModules = @($MemoryModules)
  }
  storage = @($Storage)
  network = [ordered]@{ adapters = @($NetworkAdapters); publicIp = $PublicIp }
  security = [ordered]@{
    antivirusProduct = if ($Antivirus) { [string]$Antivirus.displayName } else { $null }
    antivirusEnabled = if ($Antivirus) { (($Antivirus.productState -band 0x1000) -ne 0) } else { $null }
    antivirusUpToDate = if ($Antivirus) { (($Antivirus.productState -band 0x10) -eq 0) } else { $null }
    firewallEnabled = if ($FirewallProfiles.Count -gt 0) { (@($FirewallProfiles | Where-Object { -not $_.Enabled }).Count -eq 0) } else { $null }
    bitLockerEnabled = if ($BitLockerByMount.Count -gt 0) { (@($BitLockerByMount.Values | Where-Object { $_ -ne "On" }).Count -eq 0) } else { $null }
    secureBootEnabled = $SecureBoot
    tpmPresent = if ($Tpm) { [bool]$Tpm.TpmPresent } else { $null }
    tpmReady = if ($Tpm) { [bool]$Tpm.TpmReady } else { $null }
    pendingRestart = $PendingRestart
    windowsUpdateState = $null
    localAdministrators = @($LocalAdministrators)
  }
  software = @($InstalledSoftware)
  checkErrors = @($CheckErrors)
}

$Json = $Audit | ConvertTo-Json -Depth 12 -Compress
if ($Mode -eq "Local") {
  $resolvedOutput = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
  [IO.File]::WriteAllText($resolvedOutput, $Json, (New-Object Text.UTF8Encoding($false)))
}

if ($Mode -eq "Upload") {
  if ($EnrollmentToken) {
    $enrolmentBody = @{ token = $EnrollmentToken; computerName = [Environment]::MachineName; deviceIdentifier = $WindowsDeviceId } | ConvertTo-Json -Compress
    $enrolment = Invoke-RestMethod -Uri "$($SourceHubUrl.TrimEnd('/'))/api/network/enrol" -Method Post -ContentType "application/json" -Body $enrolmentBody
    $EndpointId = [string]$enrolment.endpointId
    $EndpointCredential = [string]$enrolment.credential
  }
  if (-not $EndpointCredential -and $env:SOURCEHUB_ENDPOINT_CREDENTIAL) { $EndpointCredential = $env:SOURCEHUB_ENDPOINT_CREDENTIAL }
  if (-not $EndpointId -and $env:SOURCEHUB_ENDPOINT_ID) { $EndpointId = $env:SOURCEHUB_ENDPOINT_ID }
  if (-not $EndpointId -or -not $EndpointCredential) { throw "Upload mode requires an endpoint ID and restricted endpoint credential, or an enrolment token." }
  $requestTimestamp = (Get-Date).ToUniversalTime().ToString("o")
  $nonce = [guid]::NewGuid().ToString("N")
  $signature = Get-HmacSignature -Secret $EndpointCredential -Timestamp $requestTimestamp -Nonce $nonce -Body $Json
  $headers = @{
    "X-SourceHub-Endpoint-Id" = $EndpointId
    "X-SourceHub-Credential" = $EndpointCredential
    "X-SourceHub-Timestamp" = $requestTimestamp
    "X-SourceHub-Nonce" = $nonce
    "X-SourceHub-Signature" = $signature
    "Idempotency-Key" = $AuditId
  }
  $response = Invoke-RestMethod -Uri "$($SourceHubUrl.TrimEnd('/'))/api/network/audits" -Method Post -ContentType "application/json" -Headers $headers -Body $Json
}

Write-Host ""
Write-Host "Source IT Services - Windows Endpoint Audit" -ForegroundColor Cyan
Write-Host "Audit ID: $AuditId"
Write-Host "Computer: $([Environment]::MachineName)"
Write-Host "Script / schema: $ScriptVersion / $SchemaVersion"
Write-Host "Administrator: $IsAdministrator"
Write-Host "Checks with limited or unavailable data: $($CheckErrors.Count)"
if ($Mode -eq "Local") { Write-Host "Audit exported to: $resolvedOutput" -ForegroundColor Green }
if ($Mode -eq "Upload") { Write-Host "Audit securely submitted to SourceHub." -ForegroundColor Green }
Write-Host "No system settings were changed." -ForegroundColor DarkGray
