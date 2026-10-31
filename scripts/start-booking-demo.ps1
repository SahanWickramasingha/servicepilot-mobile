param(
  [Parameter(Mandatory = $true)][ValidateSet('Emulators', 'Seed', 'Backend', 'Verify', 'Mobile', 'Connect')][string]$Mode,
  [string[]]$Devices = @('emulator-5554', 'emulator-5556')
)
# Explicit disposable demo mode only. Does not change .env.local or any remote settings.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host 'BOOKING DEMO: disposable demo-servicepilot-review-author data only; production accounts/requests are not used.'
# Scope all configuration to this process. Never rewrite .env.local or the photo endpoint.
if ($Mode -in @('Seed', 'Backend', 'Verify')) {
  $env:DISPATCHER_MODE = 'emulator'
  $env:GOOGLE_CLOUD_PROJECT = 'demo-servicepilot-review-author'
  $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9197'
  $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8187'
  $env:DISPATCHER_ADMIN_ORIGIN = 'http://localhost:5173'
  $env:BOOKING_WEB_ORIGIN = 'http://localhost:8081'
  $env:PORT = '8789'
  foreach ($bookingPort in @(9197, 8187)) {
    $bookingClient = New-Object System.Net.Sockets.TcpClient
    try {
      $bookingConnect = $bookingClient.ConnectAsync('127.0.0.1', $bookingPort)
      if (!$bookingConnect.Wait(3000) -or !$bookingClient.Connected) { throw 'Not connected' }
    } catch { throw "Firebase emulator port $bookingPort is unavailable. Start -Mode Emulators first." }
    finally { $bookingClient.Dispose() }
  }
}
switch ($Mode) {
  'Emulators' {
    # Isolate CLI state from production login/config; no credentials are required.
    $env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.firebase/review-config/booking-demo'
    $env:FIREBASE_CLI_DISABLE_MOTD = '1'
    $env:DEBUG = ''
    & firebase.cmd emulators:start --project demo-servicepilot-review-author --config firebase.review-author-test.json --only auth,firestore,storage
  }
  'Seed' {
    & npm.cmd --prefix functions run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & node scripts/seed-booking-emulator.mjs
  }
  'Backend' {
    & npm.cmd --prefix functions run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & npm.cmd --prefix functions run dispatcher:serve
  }
  'Verify' {
    & node --test --test-concurrency=1 --test-timeout=90000 scripts/tests/booking-runtime.test.mjs
  }
  'Mobile' {
  # Require the real scheduling route, not merely an open TCP port.
  Add-Type -AssemblyName System.Net.Http
  $bookingHttp = New-Object System.Net.Http.HttpClient
  $bookingHttp.Timeout = [TimeSpan]::FromSeconds(5)
  $bookingBody = New-Object System.Net.Http.StringContent('{}', [Text.Encoding]::UTF8, 'application/json')
  try {
    $bookingProbe = $bookingHttp.PostAsync('http://127.0.0.1:8789/v1/bookings/schedule', $bookingBody).GetAwaiter().GetResult()
    $bookingProbeBody = $bookingProbe.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
    if ([int]$bookingProbe.StatusCode -ne 401 -or $bookingProbeBody.code -ne 'unauthenticated') {
      throw 'The scheduling route did not return the expected authentication boundary.'
    }
  } catch { throw 'Booking backend is not ready on 127.0.0.1:8789. Start -Mode Backend first, then -Mode Verify.' }
  finally { $bookingBody.Dispose(); $bookingHttp.Dispose() }
  $env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = '1'
  $env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '127.0.0.1'
  $env:EXPO_PUBLIC_BOOKING_API_URL = 'http://127.0.0.1:8789'
  $env:EXPO_OFFLINE = '1'
  Write-Host 'Mobile booking endpoint: http://127.0.0.1:8789 (requires adb reverse). Photo configuration is preserved.'
  & npx.cmd --no-install expo start --localhost --port 8081 --clear
  }
  'Connect' {
    $bookingAdb = Join-Path $env:LOCALAPPDATA 'Android/Sdk/platform-tools/adb.exe'
    if (!(Test-Path -LiteralPath $bookingAdb)) { throw 'Android SDK adb.exe was not found.' }
    foreach ($bookingDevice in $Devices) {
      foreach ($bookingPort in @(8081, 8187, 9197, 9297, 8789)) {
        & $bookingAdb -s $bookingDevice reverse "tcp:$bookingPort" "tcp:$bookingPort"
        if ($LASTEXITCODE -ne 0) { throw "adb reverse failed for $bookingDevice port $bookingPort" }
      }
      # Cold-start Expo Go so persisted production sessions cannot survive a Fast Refresh.
      & $bookingAdb -s $bookingDevice shell am force-stop host.exp.exponent
      if ($LASTEXITCODE -ne 0) { throw "Could not stop Expo Go on $bookingDevice" }
      & $bookingAdb -s $bookingDevice shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081'
      if ($LASTEXITCODE -ne 0) { throw "Could not open Expo Go on $bookingDevice" }
    }
  }
}
exit $LASTEXITCODE
