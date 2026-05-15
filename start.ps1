$env:ANTHROPIC_API_KEY=(Get-Content .env | Where-Object { $_ -match "ANTHROPIC_API_KEY" } | ForEach-Object { $_.Split("=")[1] })
python -m jaclang start main.jac --no_client --port 8765
