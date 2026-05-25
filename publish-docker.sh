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

# Function to display help
show_help() {
    echo "Automated publishing script for ValeNote"
    echo
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  -v, --version VERSION    Version to publish"
    echo "  --no-latest              Don't tag as latest"
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
echo -e "${CYAN}Step 2: Building and pushing image (linux/amd64)...${NC}"

TAGS="-t $IMAGE_NAME:$VERSION"
if [[ "$LATEST" == true ]]; then
    TAGS="$TAGS -t $IMAGE_NAME:latest"
fi

BUILD_ARGS="--build-arg VERSION=$VERSION"

# Detect proxy from environment (check both upper and lower case)
PROXY_HTTP="${HTTP_PROXY:-$http_proxy}"
PROXY_HTTPS="${HTTPS_PROXY:-$https_proxy}"

# Convert localhost to host.docker.internal for Docker container access
if [[ -n "$PROXY_HTTP" ]]; then
    DOCKER_HTTP_PROXY=$(echo "$PROXY_HTTP" | sed 's/127\.0\.0\.1/host.docker.internal/g' | sed 's/localhost/host.docker.internal/g')
    BUILD_ARGS="$BUILD_ARGS --build-arg HTTP_PROXY=$DOCKER_HTTP_PROXY --build-arg http_proxy=$DOCKER_HTTP_PROXY"
    echo -e "${YELLOW}Using HTTP_PROXY: $DOCKER_HTTP_PROXY${NC}"
fi
if [[ -n "$PROXY_HTTPS" ]]; then
    DOCKER_HTTPS_PROXY=$(echo "$PROXY_HTTPS" | sed 's/127\.0\.0\.1/host.docker.internal/g' | sed 's/localhost/host.docker.internal/g')
    BUILD_ARGS="$BUILD_ARGS --build-arg HTTPS_PROXY=$DOCKER_HTTPS_PROXY --build-arg https_proxy=$DOCKER_HTTPS_PROXY"
    echo -e "${YELLOW}Using HTTPS_PROXY: $DOCKER_HTTPS_PROXY${NC}"
fi

if ! docker buildx build --platform linux/amd64 $TAGS $BUILD_ARGS --push .; then
    echo -e "${RED}ERROR: Build and push failed${NC}" >&2
    exit 1
fi

echo -e "${GREEN}Pushed $IMAGE_NAME:$VERSION${NC}"
if [[ "$LATEST" == true ]]; then
    echo -e "${GREEN}Pushed $IMAGE_NAME:latest${NC}"
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
