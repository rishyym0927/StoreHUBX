#!/bin/bash

# StoreHUBX Setup Script
# This script helps you set up the development environment

set -e

echo "🚀 StoreHUBX Setup Script"
echo "=========================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "ℹ $1"
}

# Check if required tools are installed
check_prerequisites() {
    echo "📋 Checking prerequisites..."
    echo ""
    
    local missing_tools=()
    
    if ! command -v go &> /dev/null; then
        missing_tools+=("go")
    else
        print_success "Go is installed ($(go version))"
    fi
    
    if ! command -v node &> /dev/null; then
        missing_tools+=("node")
    else
        print_success "Node.js is installed ($(node --version))"
    fi
    
    if ! command -v npm &> /dev/null; then
        missing_tools+=("npm")
    else
        print_success "npm is installed ($(npm --version))"
    fi
    
    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    else
        print_success "Docker is installed"
    fi
    
    # Check for docker compose (newer) or docker-compose (legacy)
    if docker compose version &> /dev/null; then
        print_success "Docker Compose is installed (modern version)"
        DOCKER_COMPOSE_CMD="docker compose"
    elif command -v docker-compose &> /dev/null; then
        print_success "Docker Compose is installed (legacy version)"
        DOCKER_COMPOSE_CMD="docker-compose"
    else
        missing_tools+=("docker-compose")
        DOCKER_COMPOSE_CMD="docker compose"
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        echo ""
        echo "Please install the missing tools and try again."
        echo "See README.md for installation instructions."
        exit 1
    fi
    
    echo ""
}

# Setup backend
setup_backend() {
    echo "🔧 Setting up Backend..."
    echo ""
    
    cd StoreHUBXBackend
    
    # Check if .env exists
    if [ ! -f .env ]; then
        print_warning ".env file not found"
        if [ -f .env.example ]; then
            print_info "Copying .env.example to .env"
            cp .env.example .env
            print_success "Created .env file"
            print_warning "⚠️  IMPORTANT: Edit StoreHUBXBackend/.env and configure:"
            echo "   - MONGO_URI"
            echo "   - JWT_SECRET"
            echo "   - GITHUB_CLIENT_ID"
            echo "   - GITHUB_CLIENT_SECRET"
            echo ""
        else
            print_error ".env.example not found"
            exit 1
        fi
    else
        print_success ".env file exists"
    fi
    
    # Download Go dependencies
    print_info "Downloading Go dependencies..."
    go mod download
    print_success "Go dependencies downloaded"
    
    # Build binaries
    print_info "Building backend binaries..."
    mkdir -p bin
    go build -o bin/api cmd/main.go
    go build -o bin/worker cmd/worker/main.go
    print_success "Backend binaries built successfully"
    
    cd ..
    echo ""
}

# Setup frontend
setup_frontend() {
    echo "🎨 Setting up Frontend..."
    echo ""
    
    cd StoreHUBClient
    
    # Check if .env.local exists
    if [ ! -f .env.local ]; then
        print_warning ".env.local file not found"
        if [ -f .env.example ]; then
            print_info "Copying .env.example to .env.local"
            cp .env.example .env.local
            print_success "Created .env.local file"
        else
            print_error ".env.example not found"
            exit 1
        fi
    else
        print_success ".env.local file exists"
    fi
    
    # Install dependencies
    print_info "Installing Node.js dependencies (this may take a while)..."
    npm install
    print_success "Frontend dependencies installed"
    
    cd ..
    echo ""
}

# Start Docker services
start_docker_services() {
    echo "🐳 Starting Docker services..."
    echo ""
    
    cd StoreHUBXBackend
    
    print_info "Starting MinIO with $DOCKER_COMPOSE_CMD..."
    $DOCKER_COMPOSE_CMD up -d
    
    # Wait for services to be ready
    print_info "Waiting for services to start..."
    sleep 5
    
    if $DOCKER_COMPOSE_CMD ps | grep -q "Up"; then
        print_success "Docker services started"
        print_info "MinIO Console: http://localhost:9001"
        print_info "MinIO Credentials: minioadmin / minioadmin"
    else
        print_warning "Could not verify service status, checking logs..."
        $DOCKER_COMPOSE_CMD logs --tail=20
        print_warning "If services are running, you can continue. Otherwise, check the logs above."
    fi
    
    cd ..
    echo ""
}

# Main setup flow
main() {
    check_prerequisites
    
    echo "📦 Installing components..."
    echo ""
    
    # Ask what to set up
    echo "What would you like to set up?"
    echo "1) Everything (Backend + Frontend + Docker)"
    echo "2) Backend only"
    echo "3) Frontend only"
    echo "4) Docker services only"
    echo ""
    read -p "Enter your choice (1-4): " choice
    echo ""
    
    case $choice in
        1)
            start_docker_services
            setup_backend
            setup_frontend
            ;;
        2)
            setup_backend
            ;;
        3)
            setup_frontend
            ;;
        4)
            start_docker_services
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
    
    echo ""
    echo "=========================================="
    print_success "Setup completed successfully!"
    echo "=========================================="
    echo ""
    echo "📚 Next steps:"
    echo ""
    
    if [ "$choice" == "1" ] || [ "$choice" == "2" ]; then
        echo "1. Configure your environment variables:"
        echo "   - Edit StoreHUBXBackend/.env"
        echo "   - Set up GitHub OAuth at https://github.com/settings/developers"
        echo ""
        echo "2. Start the backend:"
        echo "   cd StoreHUBXBackend"
        echo "   ./bin/api          # Start API server"
        echo "   ./bin/worker       # Start worker (in another terminal)"
        echo ""
    fi
    
    if [ "$choice" == "1" ] || [ "$choice" == "3" ]; then
        echo "3. Start the frontend:"
        echo "   cd StoreHUBClient"
        echo "   npm run dev"
        echo ""
    fi
    
    echo "4. Access the application:"
    echo "   - Frontend: http://localhost:3000"
    echo "   - Backend API: http://localhost:8080"
    echo "   - API Docs: http://localhost:8080/docs/index.html"
    echo "   - MinIO Console: http://localhost:9001"
    echo ""
    echo "📖 For more information, see README.md"
    echo ""
}

# Run main function
main
