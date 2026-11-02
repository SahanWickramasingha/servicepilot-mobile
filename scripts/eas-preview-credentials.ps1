param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  # Capture allowlisted mobile variables in memory. Never echo this JSON.
  # Explicit process values win. No file is written or changed.
  $taskLocalJson = & node -e "const fs=require('node:fs'),{parseEnv}=require('node:util');const names=['GOOGLE_MAPS_ANDROID_API_KEY','EXPO_PUBLIC_BOOKING_API_URL','EXPO_PUBLIC_PHOTO_API_URL'];const out={};for(const file of ['.env','.env.local']){if(fs.existsSync(file)){const parsed=parseEnv(fs.readFileSync(file,'utf8'));for(const name of names)if(parsed[name]!==undefined)out[name]=parsed[name];}}process.stdout.write(JSON.stringify(out));"
  if ($LASTEXITCODE -ne 0) { throw 'FAIL LOCAL_ENV_READ' }
  $taskLocal = $taskLocalJson | ConvertFrom-Json
  foreach ($taskProperty in $taskLocal.PSObject.Properties) {
    if ($null -eq [Environment]::GetEnvironmentVariable($taskProperty.Name, 'Process')) {
      [Environment]::SetEnvironmentVariable($taskProperty.Name, $taskProperty.Value, 'Process')
    }
  }
  Remove-Variable taskLocalJson, taskLocal
  $taskProfile = (Get-Content -LiteralPath 'eas.json' -Raw | ConvertFrom-Json).build.preview
  foreach ($taskProperty in $taskProfile.env.PSObject.Properties) {
    [Environment]::SetEnvironmentVariable($taskProperty.Name, $taskProperty.Value, 'Process')
  }
  if ([string]::IsNullOrWhiteSpace($env:GOOGLE_MAPS_ANDROID_API_KEY) -and -not $CheckOnly) {
    $taskSecure = Read-Host 'GOOGLE_MAPS_ANDROID_API_KEY' -AsSecureString
    try { $env:GOOGLE_MAPS_ANDROID_API_KEY = [Net.NetworkCredential]::new('', $taskSecure).Password }
    finally { $taskSecure.Dispose(); Remove-Variable taskSecure }
  }
  $env:EXPO_NO_DOTENV = '1'
  & node scripts/check-preview-config.mjs
  if ($LASTEXITCODE -ne 0) { throw 'FAIL PREVIEW_CONFIG' }
  if (-not $CheckOnly) {
    # Direct PowerShell supports .cmd; no nested env:exec process.
    & npx.cmd eas-cli@latest credentials --platform android
    if ($LASTEXITCODE -ne 0) { throw 'FAIL EAS_CREDENTIALS' }
  }
} finally {
  Pop-Location
}
