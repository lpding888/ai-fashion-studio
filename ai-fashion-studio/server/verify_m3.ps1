
# Start Server
$serverProcess = Start-Process -FilePath "npm" -ArgumentList "run start" -PassThru -NoNewWindow
Write-Host "Server started with PID: $($serverProcess.Id). Waiting 20s..."
Start-Sleep -Seconds 20

# Create Task on Port 5000
$url = "http://localhost:5000/tasks"
$filePath = ".\dummy.png"

# Validation
try {
    Write-Host "Sending Request to $url..."
    $response = Invoke-RestMethod -Uri $url -Method Post -InFile $filePath -ContentType "multipart/form-data" -Body @{
        requirements = "Make it cyber punk"
        shot_count   = "2"
    }
    Write-Host "Success! Response:"
    
    # Print JSON
    $response | ConvertTo-Json -Depth 5
    
    # Check for image paths
    if ($response.shots[0].image_path) {
        Write-Host "Image Generation Verified! Path: $($response.shots[0].image_path)"
    }
    else {
        Write-Error "No image path found in response!"
    }

}
catch {
    Write-Host "Error: $_"
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)"
    }
}

# Cleanup
Stop-Process -Id $serverProcess.Id -Force
