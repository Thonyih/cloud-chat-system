#!/bin/bash

# Complete Rebuild and Deploy Script
# Run this from the Application directory

set -e  # Exit on error

echo "==========================================="
echo "Chat Application - Rebuild & Deploy"
echo "==========================================="
echo ""

# Configuration
DOCKER_USER="teritos"  
PROJECT_ID="agisit25-g60"
ZONE="europe-west1-b"
VM_NAME="agisit-60-vm"

echo "Docker Hub User: $DOCKER_USER"
echo "GCP Project: $PROJECT_ID"
echo "VM: $VM_NAME"
echo ""

# Step 1: Build Docker Images
echo "==========================================="
echo "Step 1: Building Docker Images"
echo "==========================================="
echo ""

echo "[1/5] Building frontend..."
docker build -t ${DOCKER_USER}/frontend:latest frontend/
echo "✓ Built frontend"
echo ""

cd backend/services

echo "[2/5] Building auth-users..."
docker build -f auth-users/Dockerfile -t ${DOCKER_USER}/auth-users:latest . --no-cache
echo "✓ Built auth-users"
echo ""

echo "[3/5] Building contacts..."
docker build -f contacts/Dockerfile -t ${DOCKER_USER}/contacts:latest . --no-cache
echo "✓ Built contacts"
echo ""

echo "[4/5] Building messages..."
docker build -f messages/Dockerfile -t ${DOCKER_USER}/messages:latest . --no-cache
echo "✓ Built messages"
echo ""

echo "[5/5] Building groups..."
docker build -f groups/Dockerfile -t ${DOCKER_USER}/groups:latest . --no-cache
echo "✓ Built groups"
echo ""

# Step 2: Push to Docker Hub
echo "==========================================="
echo "Step 2: Pushing to Docker Hub"
echo "==========================================="
echo ""

echo "[1/5] Pushing frontend..."
docker push ${DOCKER_USER}/frontend:latest
echo "✓ Pushed frontend"
echo ""

echo "[2/5] Pushing auth-users..."
docker push ${DOCKER_USER}/auth-users:latest
echo "✓ Pushed auth-users"
echo ""

echo "[3/5] Pushing contacts..."
docker push ${DOCKER_USER}/contacts:latest
echo "✓ Pushed contacts"
echo ""

echo "[4/5] Pushing messages..."
docker push ${DOCKER_USER}/messages:latest
echo "✓ Pushed messages"
echo ""

echo "[5/5] Pushing groups..."
docker push ${DOCKER_USER}/groups:latest
echo "✓ Pushed groups"
echo ""

cd ../..

echo "==========================================="
echo "✓ All images built and pushed!"
echo "==========================================="
echo ""

