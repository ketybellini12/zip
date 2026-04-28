#!/usr/bin/env bash
set -euo pipefail

# AI Builder Deployment Script
# Usage: ./scripts/deploy.sh --platform=vercel --env=production

PLATFORM="vercel"
ENV="production"
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --platform=*) PLATFORM="${1#*=}" ;;
    --env=*) ENV="${1#*=}" ;;
    --dry-run) DRY_RUN=true ;;
    --help) 
      echo "Usage: $0 [--platform=vercel|docker|railway] [--env=production|staging] [--dry-run]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# Pre-flight checks
check_prereqs() {
  log "Running pre-flight checks..."
  
  # Check required env vars
  local required_vars=("NEXTAUTH_SECRET" "DATABASE_URL" "INTERNAL_API_KEY")
  for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      error "Required environment variable $var is not set"
    fi
  done
  
  # Check Node version
  local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [[ $node_version -lt 18 ]]; then
    error "Node.js 18+ required (found $(node -v))"
  fi
  
  log "✓ All pre-flight checks passed"
}

# Deploy to Vercel
deploy_vercel() {
  log "Deploying to Vercel ($ENV)..."
  
  if [[ "$DRY_RUN" == "true" ]]; then
    warn "Dry run: would execute: vercel deploy --prod --scope=your-org"
    return 0
  fi
  
  # Install Vercel CLI if needed
  if ! command -v vercel &> /dev/null; then
    log "Installing Vercel CLI..."
    npm install -g vercel
  fi
  
  # Deploy
  vercel deploy --prod --scope=your-org --yes
  
  log "✓ Vercel deployment complete"
}

# Deploy with Docker
deploy_docker() {
  log "Building Docker image..."
  
  if [[ "$DRY_RUN" == "true" ]]; then
    warn "Dry run: would build and push Docker image"
    return 0
  fi
  
  # Build
  docker build -f docker/Dockerfile -t ai-builder:$ENV .
  
  # Tag for registry (customize for your registry)
  docker tag ai-builder:$ENV registry.example.com/ai-builder:$ENV-$(git rev-parse --short HEAD)
  
  # Push (uncomment and configure for your registry)
  # docker push registry.example.com/ai-builder:$ENV-$(git rev-parse --short HEAD)
  
  log "✓ Docker build complete"
  warn "Next: Deploy to your orchestrator (Kubernetes, ECS, etc.)"
}

# Deploy to Railway
deploy_railway() {
  log "Deploying to Railway ($ENV)..."
  
  if [[ "$DRY_RUN" == "true" ]]; then
    warn "Dry run: would execute: railway up --environment=$ENV"
    return 0
  fi
  
  # Install Railway CLI if needed
  if ! command -v railway &> /dev/null; then
    log "Installing Railway CLI..."
    npm install -g @railway/cli
  fi
  
  # Deploy
  railway up --environment=$ENV --detach
  
  log "✓ Railway deployment complete"
}

# Post-deployment verification
verify_deployment() {
  log "Verifying deployment..."
  
  local health_url="${HEALTH_URL:-https://your-domain.com/api/health}"
  
  for i in {1..10}; do
    if curl -sf "$health_url" | grep -q '"status":"healthy"'; then
      log "✓ Health check passed"
      return 0
    fi
    warn "Health check attempt $i/10 failed, retrying in 5s..."
    sleep 5
  done
  
  error "Health check failed after 10 attempts"
}

# Main execution
main() {
  check_prereqs
  
  case $PLATFORM in
    vercel) deploy_vercel ;;
    docker) deploy_docker ;;
    railway) deploy_railway ;;
    *) error "Unknown platform: $PLATFORM" ;;
  esac
  
  verify_deployment
  
  echo ""
  echo "🎉 Deployment successful!"
  echo "📊 Monitor: ${HEALTH_URL:-https://your-domain.com/api/health}"
  echo "📚 Docs: https://docs.your-domain.com"
}

main