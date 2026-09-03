$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm verify

Write-Host "Phase 0 foundation verified. Run 'pnpm dev' to start server and dashboard."
