# Read the file
$content = Get-Content -Path "PongGameOverScene.ts" -Raw

# Change all Arial Black/Arial fonts to Luckiest Guy
$content = $content -replace "fontFamily: 'Arial Black[^']*'", "fontFamily: 'Luckiest Guy'"
$content = $content -replace "fontFamily: 'Arial'", "fontFamily: 'Luckiest Guy'"

# Change BACK TO GAME MENU to BACK TO BEARPARK
$content = $content -replace "BACK TO GAME MENU", "BACK TO BEARPARK"

# Save the file
$content | Set-Content -Path "PongGameOverScene.ts" -NoNewline
