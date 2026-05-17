$env:ANTHROPIC_API_KEY=(Get-Content .env | Where-Object { $_ -match "ANTHROPIC_API_KEY" } | ForEach-Object { $_.Split("=",2)[1] }).Trim()
Write-Host "API Key loaded: $($env:ANTHROPIC_API_KEY.Substring(0,15))..."
python -m jaclang start main.jac --no_client --port 8766