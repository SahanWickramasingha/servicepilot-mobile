param(
  [ValidateSet('Check', 'Access', 'Backend', 'Probe', 'Mobile')][string]$Mode = 'Check',
  [string]$CredentialFile = $env:SERVICEPILOT_BOOKING_CREDENTIALS,
  [string]$ServiceAccountEmail = $env:SERVICEPILOT_BOOKING_SERVICE_ACCOUNT,
  [string]$BookingApiUrl
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (!$PSBoundParameters.ContainsKey('BookingApiUrl')) {
  $bookingLine = Get-Content -LiteralPath '.env.local' -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*EXPO_PUBLIC_BOOKING_API_URL\s*=' } | Select-Object -Last 1
  $BookingApiUrl = if ($bookingLine) { ($bookingLine -replace '^\s*EXPO_PUBLIC_BOOKING_API_URL\s*=\s*', '').Trim().Trim('"', "'") } else { $env:EXPO_PUBLIC_BOOKING_API_URL }
}
Write-Host 'REAL FIREBASE booking-only server: servicepilot-756d9. No seed or booking smoke writes are performed.'
if ($Mode -in @('Check', 'Access', 'Backend')) {
  if ($CredentialFile) { $env:SERVICEPILOT_BOOKING_CREDENTIALS = $CredentialFile }
  if ($ServiceAccountEmail) { $env:SERVICEPILOT_BOOKING_SERVICE_ACCOUNT = $ServiceAccountEmail }
  & node scripts/booking-real-preflight.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if ($Mode -eq 'Check') { exit 0 }
  if ($Mode -eq 'Access') {
    & node scripts/check-booking-real-access.mjs
    exit $LASTEXITCODE
  }

  foreach ($bookingVariable in @('FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST',
      'FIREBASE_STORAGE_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST')) {
    if ([Environment]::GetEnvironmentVariable($bookingVariable)) {
      throw "Remove $bookingVariable from this shell before starting the real Firebase backend."
    }
  }
  $bookingListener = netstat -ano | Select-String '^\s*TCP\s+\S+:8790\s+\S+\s+LISTENING\s+'
  if ($bookingListener) { throw 'Port 8790 is already occupied. Inspect the existing server before restarting it.' }
  # Ignore generic ADC/photo settings; select only the explicitly validated identity.
  $env:GOOGLE_APPLICATION_CREDENTIALS = (Resolve-Path -LiteralPath $env:SERVICEPILOT_BOOKING_CREDENTIALS).Path
  $env:GOOGLE_CLOUD_PROJECT = 'servicepilot-756d9'
  $env:DISPATCHER_MODE = 'production'
  $env:DISPATCHER_SERVICES = 'booking'
  $env:DISPATCHER_BIND_ADDRESS = '127.0.0.1'
  $env:PORT = '8790'
  # Native local testing has no browser origin. Unrelated inherited Admin/CORS values are not needed.
  Remove-Item Env:DISPATCHER_ADMIN_ORIGIN -ErrorAction SilentlyContinue
  Remove-Item Env:BOOKING_WEB_ORIGIN -ErrorAction SilentlyContinue
  & npm.cmd --prefix functions run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & npm.cmd --prefix functions run dispatcher:serve
  exit $LASTEXITCODE
}
if ($Mode -eq 'Probe') {
  if ($BookingApiUrl) { $env:EXPO_PUBLIC_BOOKING_API_URL = $BookingApiUrl }
  & node scripts/probe-booking-real.mjs
  exit $LASTEXITCODE
}
if (!$BookingApiUrl) { throw 'Supply -BookingApiUrl with the approved HTTPS origin printed by your local HTTPS tunnel/proxy.' }
$bookingUri = $null
if (![Uri]::TryCreate($BookingApiUrl, [UriKind]::Absolute, [ref]$bookingUri) -or
    $bookingUri.Scheme -ne 'https' -or $bookingUri.UserInfo -or $bookingUri.Query -or $bookingUri.Fragment -or $bookingUri.AbsolutePath -ne '/') {
  throw 'BookingApiUrl must be a trusted HTTPS origin without credentials, path, query or fragment.'
}
$env:EXPO_PUBLIC_BOOKING_API_URL = $BookingApiUrl
& node scripts/probe-booking-real.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# Keep server credential paths out of the Metro child environment.
foreach ($bookingVariable in @('GOOGLE_APPLICATION_CREDENTIALS', 'SERVICEPILOT_BOOKING_CREDENTIALS', 'SERVICEPILOT_BOOKING_SERVICE_ACCOUNT')) {
  Remove-Item "Env:$bookingVariable" -ErrorAction SilentlyContinue
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-servicepilot-real.ps1 -BookingApiUrl $BookingApiUrl
exit $LASTEXITCODE
