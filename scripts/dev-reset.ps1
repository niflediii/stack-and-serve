$ErrorActionPreference = "SilentlyContinue"

$workspace = Split-Path -Parent $PSScriptRoot
Set-Location $workspace

$listeners = Get-NetTCPConnection -LocalPort 3000 -State Listen
foreach ($listener in $listeners) {
  Stop-Process -Id $listener.OwningProcess -Force
}

$cacheDirs = @(
  ".next",
  ".next-old",
  ".next-runtime",
  ".next-runtime-old",
  ".next-runtime-devtools-off-old"
)

foreach ($dir in $cacheDirs) {
  if (Test-Path $dir) {
    Remove-Item -LiteralPath $dir -Recurse -Force
  }
}

$ErrorActionPreference = "Continue"
npm run dev
