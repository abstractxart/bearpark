# Read the file
$content = Get-Content -Path "PongGameOverScene.ts" -Raw

# Update VICTORY/GAME OVER colors to be more vibrant
$content = $content -replace "color: this\.didWin \? '#4ade80' : '#ff6b6b'", "color: this.didWin ? '#07ae08' : '#ffae00'"

# Update score title color from orange to BEARpark yellow
$content = $content -replace "color: '#ffaa00'", "color: '#ffae00'"

# Update leaderboard title to use BEARpark purple
$content = $content -replace "fontSize: '26px',\s+color: '#FFD700'", "fontSize: '32px',`n      color: '#ffae00'"

# Update retry button color to BEARpark green
$content = $content -replace "retryGraphics\.fillStyle\(0xd85c47, 1\)", "retryGraphics.fillStyle(0x07ae08, 1)"
$content = $content -replace "retryGraphics\.fillStyle\(0xff7055, 1\)", "retryGraphics.fillStyle(0x09d00a, 1)"
$content = $content -replace "retryGraphics\.fillStyle\(0xd8574c, 1\)", "retryGraphics.fillStyle(0x07ae08, 1)"

# Update button font sizes to be larger
$content = $content -replace "fontSize: '24px',\s+color: '#ffffff',\s+fontStyle: 'bold',\s+fontFamily: 'Luckiest Guy'", "fontSize: '28px',`n      color: '#ffffff',`n      fontStyle: 'bold',`n      fontFamily: 'Luckiest Guy'"

# Save the file
$content | Set-Content -Path "PongGameOverScene.ts" -NoNewline
