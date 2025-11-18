# Read the file
$content = Get-Content -Path "PongGameOverScene.ts" -Raw

# Update title styling - font size from 24px to 26px
$content = $content -replace "const title = this\.add\.text\(0, 0, '🏆 TOP 10 PLAYERS 🏆', \{[^}]+fontSize: '24px'", "const title = this.add.text(0, 0, '🏆 TOP 10 PLAYERS 🏆', {`n      fontSize: '26px'"

# Update color from #4a90e2 to #FFD700 (gold)
$content = $content -replace "fontSize: '26px',\s+color: '#4a90e2'", "fontSize: '26px',`n      color: '#FFD700'"

# Update fontFamily
$content = $content -replace "fontStyle: 'bold'\s+\}\);", "fontStyle: 'bold',`n      fontFamily: 'Arial Black'`n    });"

# Add stroke after setOrigin
$content = $content -replace "title\.setOrigin\(0\.5\);", "title.setOrigin(0.5);`n    title.setStroke('#000000', 3);"

# Save the file
$content | Set-Content -Path "PongGameOverScene.ts" -NoNewline
