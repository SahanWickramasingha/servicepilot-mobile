param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  $env:EAS_BUILD_PROFILE = 'preview'
  # Reuse the working loader and its real Expo CLI validation. CheckOnly here
  # prevents the credentials helper from opening or changing signing credentials.
  # It loads allowlisted local values into this same process, without file writes.
  & (Join-Path $PSScriptRoot 'eas-preview-credentials.ps1') -CheckOnly
  if ($LASTEXITCODE -ne 0) { throw 'FAIL PREVIEW_CONFIG' }

  if (-not $CheckOnly) {
    # Invoke .cmd directly through PowerShell, without nested env:exec.
    & npx.cmd eas-cli@latest build --platform android --profile preview
    if ($LASTEXITCODE -ne 0) { throw 'FAIL EAS_PREVIEW_BUILD' }
  }
} finally {
  Pop-Location
}
