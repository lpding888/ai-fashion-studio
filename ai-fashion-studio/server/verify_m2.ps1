
# Start Server
$serverProcess = Start-Process -FilePath "npm" -ArgumentList "run start" -PassThru -NoNewWindow
Write-Host "Server started with PID: $($serverProcess.Id). Waiting 20s..."
Start-Sleep -Seconds 20

# Create Task
$url = "http://localhost:3000/tasks"
$filePath = ".\dummy.png"

# Validation
try {
    $response = Invoke-RestMethod -Uri $url -Method Post -InFile $filePath -ContentType "multipart/form-data" -Body @{
        requirements = "Make it cyber punk"
        shot_count = "2"
    }
    Write-Host "Success! Response:"
    $response | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error: $_"
    Write-Host $_.Exception.Response
}

# Cleanup
Stop-Process -Id $serverProcess.Id -Force
