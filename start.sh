#!/bin/bash
set -euo pipefail

echo "Starting Pitch Tank..."

pkill -f "next dev -p 5174" 2>/dev/null || true

nohup npm run dev > pitch-tank.log 2>&1 &
echo "Pitch Tank started on Port 5174."
echo "Log: pitch-tank.log"