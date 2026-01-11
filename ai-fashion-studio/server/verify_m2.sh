
# Start Server in background
echo "Starting Server..."
npm run start > server.log 2>&1 &
SERVER_PID=$!

echo "Waiting for server to launch..."
sleep 20

# Create Task
echo "Creating Task..."
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: multipart/form-data" \
  -F "files=@dummy.png;type=image/png" \
  -F "requirements=Make it cyber punk" \
  -F "shot_count=2" \
  -F "layout_mode=INDIVIDUAL"

# Stop Server
echo "Stopping Server..."
kill $SERVER_PID
