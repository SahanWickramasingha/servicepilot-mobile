# One-command entry point. Uses only disposable Firebase demo data.
$ErrorActionPreference = 'Stop'
$bookingRoot = Split-Path $PSScriptRoot -Parent
Set-Location $bookingRoot
$bookingRunner = Join-Path $PSScriptRoot 'start-booking-demo.ps1'
$bookingLogs = Join-Path $bookingRoot '.firebase/review-config/booking-demo/launcher'
New-Item -ItemType Directory -Force -Path $bookingLogs > $null

function Test-BookingPort([int]$Port) {
  $client = New-Object Net.Sockets.TcpClient
  try {
    $pending = $client.ConnectAsync('127.0.0.1', $Port)
    return ($pending.Wait(1000) -and $client.Connected)
  } catch { return $false }
  finally { $client.Dispose() }
}

function Wait-BookingPort([int]$Port) {
  $deadline = (Get-Date).AddMinutes(3)
  while (!(Test-BookingPort $Port)) {
    if ((Get-Date) -gt $deadline) { throw "Port $Port did not start. See logs in $bookingLogs" }
    Start-Sleep -Seconds 2
  }
}

function Start-BookingService([string]$Mode, [int]$Port) {
  if (!(Test-BookingPort $Port)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory $bookingRoot -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$bookingRunner`" -Mode $Mode" -RedirectStandardOutput "$bookingLogs/$Mode-$stamp.out.log" -RedirectStandardError "$bookingLogs/$Mode-$stamp.err.log" > $null
  }
  Wait-BookingPort $Port
}

function Invoke-BookingStep([string]$Mode) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $bookingRunner -Mode $Mode
  if ($LASTEXITCODE -ne 0) { throw "$Mode failed. Read the error above before continuing." }
}

try {
  Write-Host 'LOCAL DEMO ONLY: real Firebase accounts and requests are not used.' -ForegroundColor Yellow
  Write-Host '[1/5] Starting Firebase emulators...'
  Start-BookingService Emulators 9197
  Wait-BookingPort 8187
  Wait-BookingPort 9297

  Write-Host '[2/5] Starting booking backend...'
  Start-BookingService Backend 8789

  Write-Host '[3/5] Preparing demo accounts and verifying acceptance...'
  Invoke-BookingStep Seed
  Invoke-BookingStep Verify

  Write-Host '[4/5] Restarting this project''s Metro with the matching demo configuration...'
  if (Test-BookingPort 8081) {
    $manifest = Invoke-RestMethod -Uri 'http://127.0.0.1:8081' -Headers @{'expo-platform'='android'; 'accept'='application/expo+json'} -TimeoutSec 60
    if ($manifest.extra.expoClient._internal.projectRoot -ne $bookingRoot) {
      throw 'Port 8081 belongs to another project. Stop that server and run this command again.'
    }
    # Restart only the listener whose manifest identifies this exact workspace.
    $listeners = netstat -ano | Select-String '^\s*TCP\s+\S+:8081\s+\S+\s+LISTENING\s+(\d+)\s*$'
    $listenerIds = @($listeners | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Select-Object -Unique)
    if ($listenerIds.Count -ne 1) { throw 'Could not identify Metro safely. Stop the existing Metro with Ctrl+C and retry.' }
    Stop-Process -Id $listenerIds[0] -ErrorAction Stop
    $deadline = (Get-Date).AddSeconds(15)
    while (Test-BookingPort 8081) {
      if ((Get-Date) -gt $deadline) { throw 'Old Metro did not stop. Close it and retry.' }
      Start-Sleep -Seconds 1
    }
  }
  Start-BookingService Mobile 8081

  Write-Host '[5/5] Opening both Android emulators...'
  Invoke-BookingStep Connect
  Write-Host 'READY. Technician: booking-tech@example.test | Customer: booking-customer-a@example.test' -ForegroundColor Green
  Write-Host 'Demo password for both: Only-for-booking-emulator-42'
  Write-Host 'Set the technician Available, then create a future customer booking and Accept.'
  Write-Host "Services run in the background. Logs: $bookingLogs"
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "Startup stopped. Logs: $bookingLogs"
  exit 1
}
