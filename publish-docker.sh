#!/bin/bash

# Automated publishing script for ValeNote

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
LATEST=true
VERSION=""
IMAGE_NAME="bytetopia/valenote"
PLATFORMS="linux/amd64"
BUILDER_NAME="valenote-builder"

# Function to display help
show_help() {
    echo "Automated publishing script for ValeNote"
    echo
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  -v, --version VERSION    Version to publish"
    echo "  --no-latest              Don't tag as latest"
    echo "  --platform PLATFORMS     Target platforms (default: linux/amd64)"
    echo "  -h, --help               Show this help message"
    echo
    echo "Image will be published to: $IMAGE_NAME"
    echo
    echo "Examples:"
    echo "  $0                        # Interactive mode"
    echo "  $0 -v 1.0.0               # Non-interactive mode"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        --no-latest)
            LATEST=false
            shift
            ;;
        --platform)
            PLATFORMS="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}ERROR: Unknown option $1${NC}" >&2
            show_help
            exit 1
            ;;
    esac
done

# Check if we're in the right directory
if [[ ! -f "Dockerfile" ]]; then
    echo -e "${RED}ERROR: Dockerfile not found. Please run this script from the project root directory${NC}" >&2
    exit 1
fi

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}   ValeNote Docker Publishing Script   ${NC}"
echo -e "${CYAN}========================================${NC}"
echo

# Prompt for version if not provided
if [[ -z "$VERSION" ]]; then
    read -p "Enter the version to publish (e.g., 1.0.0): " VERSION
    if [[ -z "$VERSION" ]]; then
        echo -e "${RED}ERROR: Version is required${NC}" >&2
        exit 1
    fi
fi

# Confirm the settings
echo
echo -e "${CYAN}Publishing Configuration:${NC}"
echo "  Image: $IMAGE_NAME"
echo "  Version: $VERSION"
echo "  Platforms: $PLATFORMS"
echo "  Tag as latest: $LATEST"
echo

read -p "Continue with these settings? (y/n): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo
echo -e "${CYAN}Step 1: Logging in to Docker Hub...${NC}"
read -p "Enter your Docker Hub username: " DOCKER_USERNAME
if [[ -z "$DOCKER_USERNAME" ]]; then
    echo -e "${RED}ERROR: Username is required${NC}" >&2
    exit 1
fi
if ! docker login -u "$DOCKER_USERNAME"; then
    echo -e "${RED}ERROR: Docker login failed${NC}" >&2
    exit 1
fi

echo
echo -e "${CYAN}Step 2: Setting up multi-arch builder...${NC}"
if ! docker buildx inspect "$BUILDER_NAME" > /dev/null 2>&1; then
    echo "Creating new buildx builder: $BUILDER_NAME"
    docker buildx create --name "$BUILDER_NAME" --use
else
    docker buildx use "$BUILDER_NAME"
fi
docker buildx inspect --bootstrap

echo
echo -e "${CYAN}Step 3: Building and pushing multi-arch image...${NC}"

TAGS="-t $IMAGE_NAME:$VERSION"
if [[ "$LATEST" == true ]]; then
    TAGS="$TAGS -t $IMAGE_NAME:latest"
fi

if ! docker buildx build --platform "$PLATFORMS" $TAGS --build-arg VERSION="$VERSION" --push .; then
    echo -e "${RED}ERROR: Build and push failed${NC}" >&2
    exit 1
fi

echo -e "${GREEN}Pushed $IMAGE_NAME:$VERSION for platforms: $PLATFORMS${NC}"
if [[ "$LATEST" == true ]]; then
    echo -e "${GREEN}Pushed $IMAGE_NAME:latest for platforms: $PLATFORMS${NC}"
fi

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   SUCCESS: Published valenote:$VERSION   ${NC}"
echo -e "${GREEN}========================================${NC}"
echo

# Display next steps
echo -e "${GREEN}Next steps:${NC}"
echo "1. Visit https://hub.docker.com/r/bytetopia/valenote to verify"
echo "2. Test: docker pull $IMAGE_NAME:$VERSION"
echo "3. Run:  docker run -p 8080:8080 -v ./data:/data -v ./notes:/notes $IMAGE_NAME:$VERSION"
