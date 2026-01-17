# LAN Server Spike - Setup and Run Script
# This script configures the firewall and starts the server

Write-Host "`n🔧 Zorviz LAN Server Spike - Setup`n" -ForegroundColor Cyan

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  Not running as Administrator" -ForegroundColor Yellow
    Write-Host "   Some firewall configuration may require admin privileges`n" -ForegroundColor Yellow
} else {
    Write-Host "✅ Running as Administrator`n" -ForegroundColor Green
    
    # Configure Windows Firewall
    Write-Host "🔥 Configuring Windows Firewall..." -ForegroundColor Cyan
    
    try {
        $ruleName = "Zorviz LAN Server (Port 3030)"
        $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        
        if ($existingRule) {
            Write-Host "   Firewall rule already exists" -ForegroundColor Green
        } else {
            New-NetFirewallRule -DisplayName $ruleName `
                -Direction Inbound `
                -Protocol TCP `
                -LocalPort 3030 `
                -Action Allow `
                -Profile Any `
                -ErrorAction Stop | Out-Null
            
            Write-Host "   ✅ Firewall rule created successfully!" -ForegroundColor Green
        }
    } catch {
        Write-Host "   ❌ Failed to create firewall rule: $_" -ForegroundColor Red
        Write-Host "   You may need to allow port 3030 manually" -ForegroundColor Yellow
    }
}

Write-Host "`n📦 Installing dependencies..." -ForegroundColor Cyan
cargo build

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Build successful!`n" -ForegroundColor Green
    
    Write-Host "🚀 Starting server...`n" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    
    cargo run
} else {
    Write-Host "❌ Build failed. Please check the error messages above." -ForegroundColor Red
    exit 1
}
