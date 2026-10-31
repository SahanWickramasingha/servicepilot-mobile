param(
  [ValidateSet('Run', 'Metro')][string]$Mode = 'Run',
  [string]$BookingApiUrl,
  [string[]]$Devices = @('emulator-5554', 'emulator-5556')
)
# Real mobile accounts only. Does not seed data, run acceptance tests, or start a demo backend.
$ErrorActionPreference = 'Stop'
$bookingRoot = Split-Path $PSScriptRoot -Parent
Set-Location $bookingRoot
# Explicit parameter wins; otherwise prefer the current file over a stale shell.
if (!$PSBoundParameters.ContainsKey('BookingApiUrl')) {
  $bookingEnvFile = Join-Path $bookingRoot '.env.local'
  $bookingLine = if (Test-Path -LiteralPath $bookingEnvFile) {
    Get-Content -LiteralPath $bookingEnvFile | Where-Object { $_ -match '^\s*EXPO_PUBLIC_BOOKING_API_URL\s*=' } | Select-Object -Last 1
  }
  $BookingApiUrl = if ($bookingLine) { ($bookingLine -replace '^\s*EXPO_PUBLIC_BOOKING_API_URL\s*=\s*', '').Trim().Trim('"', "'") } else { $env:EXPO_PUBLIC_BOOKING_API_URL }
}
if (!$BookingApiUrl) { throw 'Booking URL is missing. Start the local backend and HTTPS tunnel before opening the apps.' }
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '0'
foreach ($bookingVariable in @('EXPO_PUBLIC_FIREBASE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST',
    'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST')) {
  [Environment]::SetEnvironmentVariable($bookingVariable, $null, 'Process')
}
if ($BookingApiUrl) {
  $bookingUri = $null
  if (![Uri]::TryCreate($BookingApiUrl, [UriKind]::Absolute, [ref]$bookingUri) -or
      $bookingUri.Scheme -ne 'https' -or $bookingUri.UserInfo -or $bookingUri.Query -or $bookingUri.Fragment -or $bookingUri.AbsolutePath -ne '/') {
    throw 'Real accounts require an approved HTTPS booking backend URL. Do not use the demo localhost endpoint.'
  }
  $env:EXPO_PUBLIC_BOOKING_API_URL = $BookingApiUrl
}
# Check both hops before stopping Metro or opening apps. No authenticated writes.
$bookingSavedOrigin = $env:EXPO_PUBLIC_BOOKING_API_URL
Remove-Item Env:EXPO_PUBLIC_BOOKING_API_URL -ErrorAction SilentlyContinue
& node scripts/probe-booking-real.mjs
if ($LASTEXITCODE -ne 0) { throw 'Local booking backend is not ready on 8790. Apps were not opened.' }
$env:EXPO_PUBLIC_BOOKING_API_URL = $bookingSavedOrigin
& node scripts/probe-booking-real.mjs
if ($LASTEXITCODE -ne 0) { throw 'Booking HTTPS tunnel is unavailable. Check DNS, TLS and tunnel lifecycle. Apps were not opened.' }
$env:EXPO_OFFLINE = '1'
Write-Host 'REAL FIREBASE: servicepilot-756d9. Sign in with your existing accounts.' -ForegroundColor Yellow
Write-Host 'Photo configuration is preserved. This launcher does not create or accept requests.'
if ($Mode -eq 'Metro') {
  & npx.cmd --no-install expo start --localhost --port 8081 --clear
  exit $LASTEXITCODE
}

$bookingAdb = Join-Path $env:LOCALAPPDATA 'Android/Sdk/platform-tools/adb.exe'
if (!(Test-Path -LiteralPath $bookingAdb)) { throw 'Android adb.exe was not found. Install the Android SDK first.' }
function Invoke-BookingAdb {
  param([string[]]$AdbArguments)
  # Windows PowerShell wraps normal native stderr (e.g. Activity warnings) as
  # ErrorRecord. Judge adb by its exit code and device state, not stderr alone.
  $bookingPreviousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $bookingAdbOutput = @(& $bookingAdb @AdbArguments 2>&1)
    $bookingAdbExit = $LASTEXITCODE
  } finally { $ErrorActionPreference = $bookingPreviousPreference }
  foreach ($bookingAdbLine in $bookingAdbOutput) {
    if ($bookingAdbLine -is [System.Management.Automation.ErrorRecord]) { Write-Host $bookingAdbLine.ToString() }
    else { Write-Output $bookingAdbLine }
  }
  if ($bookingAdbExit -ne 0) { throw "adb failed with exit code $bookingAdbExit. Check the selected emulator and its state." }
}
foreach ($bookingDevice in $Devices) {
  $bookingState = Invoke-BookingAdb -AdbArguments @('-s', $bookingDevice, 'get-state')
  if ($bookingState -ne 'device') { throw "Open Android emulator $bookingDevice first." }
}

# Restart only a Metro server whose manifest identifies this workspace.
$bookingListeners = @(netstat -ano | Select-String '^\s*TCP\s+\S+:8081\s+\S+\s+LISTENING\s+(\d+)\s*$')
if ($bookingListeners.Count) {
  $bookingManifest = Invoke-RestMethod -Uri 'http://127.0.0.1:8081' -Headers @{'expo-platform'='android'; 'accept'='application/expo+json'} -TimeoutSec 60
  if ($bookingManifest.extra.expoClient._internal.projectRoot -ne $bookingRoot) {
    throw 'Port 8081 belongs to another project. Stop that server first.'
  }
  $bookingIds = @($bookingListeners | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Select-Object -Unique)
  if ($bookingIds.Count -ne 1) { throw 'Stop the old Metro using Ctrl+C, then retry.' }
  Stop-Process -Id $bookingIds[0] -ErrorAction Stop
  $bookingStopDeadline = (Get-Date).AddSeconds(15)
  do {
    $bookingOldListener = netstat -ano | Select-String '^\s*TCP\s+\S+:8081\s+\S+\s+LISTENING\s+'
    if (!$bookingOldListener) { break }
    if ((Get-Date) -gt $bookingStopDeadline) { throw 'Old Metro did not stop. Close it and retry.' }
    Start-Sleep -Seconds 1
  } while ($true)
}
$bookingLogs = Join-Path $bookingRoot '.firebase/review-config/real-mobile'
New-Item -ItemType Directory -Force -Path $bookingLogs > $null
$bookingStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
# URL is inherited through the process environment, never copied into command-line logs.
Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory $bookingRoot -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Mode Metro -BookingApiUrl `"$BookingApiUrl`"" -RedirectStandardOutput "$bookingLogs/metro-$bookingStamp.out.log" -RedirectStandardError "$bookingLogs/metro-$bookingStamp.err.log" > $null
$bookingDeadline = (Get-Date).AddMinutes(3)
do {
  try {
    $bookingResponse = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8081/status' -TimeoutSec 3
    if ($bookingResponse.StatusCode -eq 200) { break }
  } catch { }
  if ((Get-Date) -gt $bookingDeadline) { throw "Metro did not start. See $bookingLogs" }
  Start-Sleep -Seconds 2
} while ($true)
foreach ($bookingDevice in $Devices) {
  # Remove stale demo forwards so this launch only forwards Metro.
  $bookingForwards = Invoke-BookingAdb -AdbArguments @('-s', $bookingDevice, 'reverse', '--list')
  foreach ($bookingPort in @(8187, 9197, 9297, 8789)) {
    if ($bookingForwards -match "\btcp:$bookingPort\s") {
      Invoke-BookingAdb -AdbArguments @('-s', $bookingDevice, 'reverse', '--remove', "tcp:$bookingPort")
    }
  }
  Invoke-BookingAdb -AdbArguments @('-s', $bookingDevice, 'reverse', 'tcp:8081', 'tcp:8081')
  Invoke-BookingAdb -AdbArguments @('-s', $bookingDevice, 'shell', 'am', 'force-stop', 'host.exp.exponent')
  Invoke-BookingAdb -AdbArguments @('-s', $bookingDevice, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'exp://127.0.0.1:8081')
}
Write-Host 'REAL MODE READY. Sign in with your real customer and technician accounts.' -ForegroundColor Green
Write-Host 'Acceptance still requires an approved HTTPS booking backend configured in EXPO_PUBLIC_BOOKING_API_URL.'
Write-Host "Metro logs: $bookingLogs"
