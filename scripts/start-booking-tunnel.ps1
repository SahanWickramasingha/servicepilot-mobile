param([int]$ReadyTimeoutSeconds = 60)
$ErrorActionPreference = 'Stop'
$bookingRoot = Split-Path $PSScriptRoot -Parent
Set-Location $bookingRoot
$bookingBinary = Join-Path $bookingRoot '.firebase/review-config/booking-tools/cloudflared.exe'
if (!(Test-Path -LiteralPath $bookingBinary)) { throw 'Install the official cloudflared binary at .firebase/review-config/booking-tools/cloudflared.exe first.' }
Remove-Item Env:EXPO_PUBLIC_BOOKING_API_URL -ErrorAction SilentlyContinue
& node scripts/probe-booking-real.mjs
if ($LASTEXITCODE -ne 0) { throw 'Local booking-only backend is unavailable on 8790. Tunnel not started.' }
$bookingLogs = Join-Path $bookingRoot '.firebase/review-config/real-booking'
New-Item -ItemType Directory -Force -Path $bookingLogs > $null
$bookingStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$bookingOut = Join-Path $bookingLogs "tunnel-$bookingStamp.out.log"
$bookingErr = Join-Path $bookingLogs "tunnel-$bookingStamp.err.log"
$bookingTunnel = Start-Process -FilePath $bookingBinary -WindowStyle Hidden -WorkingDirectory $bookingRoot -ArgumentList @('tunnel','--url','http://127.0.0.1:8790','--no-autoupdate','--protocol','http2') -RedirectStandardOutput $bookingOut -RedirectStandardError $bookingErr -PassThru
$bookingDeadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
try {
  do {
    if ($bookingTunnel.HasExited) { throw "Tunnel exited; inspect $bookingErr" }
    $bookingText = Get-Content -LiteralPath $bookingErr -Raw -ErrorAction SilentlyContinue
    if (!$bookingText) { $bookingText = ' ' }
    $bookingMatch = [regex]::Match([string]$bookingText, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($bookingMatch.Success) {
      $env:EXPO_PUBLIC_BOOKING_API_URL = $bookingMatch.Value
      try {
        $ErrorActionPreference = 'Continue'
        $bookingProbe = @(& node scripts/probe-booking-real.mjs 2>&1)
        $bookingProbeExit = $LASTEXITCODE
      } finally { $ErrorActionPreference = 'Stop' }
      if ($bookingProbeExit -eq 0) {
        & node scripts/save-booking-origin.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Could not save booking origin.' }
        @{ tunnelPid = $bookingTunnel.Id; origin = $bookingMatch.Value; target = 'http://127.0.0.1:8790'; log = $bookingErr } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $bookingLogs 'tunnel-state.json')
        Write-Host "HTTPS booking tunnel ready: $($bookingMatch.Value)"
        Write-Host "Tunnel PID: $($bookingTunnel.Id); log: $bookingErr"
        exit 0
      }
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $bookingDeadline)
  throw "Tunnel DNS/TLS/backend readiness failed within $ReadyTimeoutSeconds seconds. See $bookingErr. Apps were not opened."
} catch {
  if (!$bookingTunnel.HasExited) { Stop-Process -Id $bookingTunnel.Id }
  throw
}
