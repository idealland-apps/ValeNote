#!/bin/bash

# Docker build script for ValeNote

# Default values
TAG="valenote:latest"
PUSH=false
REGISTRY=""
NO_BUILD_CACHE=false
VERSION="unknown"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Function to display help
show_help() {
    echo "Docker build script for ValeNote"
    echo
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  -t, --tag TAG         Docker image tag (default: valenote:latest)"
    echo "  -v, --version VERSION Version number to embed (default: unknown)"
    echo "  -p, --push            Push image to registry after build"
    echo "  -r, --registry REG    Registry URL for pushing"
    echo "  -n, --no-cache        Build without using cache"
    echo "  -h, --help            Show this help message"
    echo
    echo "Examples:"
    echo "  $0                                    # Build with default tag"
    echo "  $0 -t valenote:v1.0.0 -v 1.0.0       # Build with specific tag and version"
    echo "  $0 -t valenote:v1.0.0 -p -r docker.io/username  # Build and push"
    echo "  $0 -n -t valenote:latest             # Build without cache"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--tag)
            TAG="$2"
            shift 2
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -p|--push)
            PUSH=true
            shift
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        -n|--no-cache)
            NO_BUILD_CACHE=true
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

echo -e "${CYAN}Building ValeNote Docker image...${NC}"

# Check if we're in the right directory
if [[ ! -f "Dockerfile" ]]; then
    echo -e "${RED}ERROR: Dockerfile not found. Please run this script from the project root directory${NC}" >&2
    exit 1
fi

# Build arguments
BUILD_ARGS=""
if [[ "$NO_BUILD_CACHE" == true ]]; then
    BUILD_ARGS="$BUILD_ARGS --no-cache"
fi

# Add version build argument
BUILD_ARGS="$BUILD_ARGS --build-arg VERSION=$VERSION"

# Add proxy settings if available (convert localhost to host.docker.internal for Docker)
if [[ -n "$HTTP_PROXY" || -n "$http_proxy" ]]; then
    PROXY_URL="${HTTP_PROXY:-$http_proxy}"
    PROXY_URL="${PROXY_URL//127.0.0.1/host.docker.internal}"
    PROXY_URL="${PROXY_URL//localhost/host.docker.internal}"
    BUILD_ARGS="$BUILD_ARGS --build-arg HTTP_PROXY=$PROXY_URL --build-arg HTTPS_PROXY=$PROXY_URL"
    echo -e "${BLUE}Using proxy: $PROXY_URL${NC}"
fi

# Build the image
echo -e "${BLUE}Building Docker image with tag: $TAG (version: $VERSION)${NC}"
BUILD_COMMAND="docker build $BUILD_ARGS -t $TAG ."
echo -e "${GRAY}Executing: $BUILD_COMMAND${NC}"

if ! eval "$BUILD_COMMAND"; then
    echo -e "${RED}ERROR: Docker build failed${NC}" >&2
    exit 1
fi

echo -e "${GREEN}SUCCESS: Docker image built successfully!${NC}"

# Push to registry if requested
if [[ "$PUSH" == true && -n "$REGISTRY" ]]; then
    FULL_TAG="$REGISTRY/$TAG"
    echo -e "${BLUE}Tagging image for registry: $FULL_TAG${NC}"

    if docker tag "$TAG" "$FULL_TAG"; then
        echo -e "${BLUE}Pushing to registry: $REGISTRY${NC}"

        if docker push "$FULL_TAG"; then
            echo -e "${GREEN}SUCCESS: Image pushed to registry!${NC}"
        else
            echo -e "${RED}ERROR: Failed to push image to registry${NC}" >&2
            exit 1
        fi
    else
        echo -e "${RED}ERROR: Failed to tag image for registry${NC}" >&2
        exit 1
    fi
elif [[ "$PUSH" == true ]]; then
    echo -e "${YELLOW}WARNING: Push requested but no registry specified${NC}"
fi

echo -e "${GREEN}Image ready: $TAG${NC}"
echo -e "${GREEN}To run: docker run -p 8080:8080 -v ./data:/data -v ./notes:/notes $TAG${NC}"
