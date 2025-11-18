# Read the file
$content = Get-Content -Path "PongGameOverScene.ts" -Raw

# Replace gradient border with yellow fill for BACK TO BEARPARK button
$pattern = "// Gradient border[\s\S]*?menuGraphics\.lineStyle.*?[\s\S]*?menuGraphics\.strokeRoundedRect.*?[\s\S]*?menuGraphics\.lineStyle.*?[\s\S]*?menuGraphics\.strokeRoundedRect.*?[\s\S]*?menuGraphics\.lineStyle.*?[\s\S]*?menuGraphics\.strokeRoundedRect.*?[\s\S]*?// Inner fill[\s\S]*?menuGraphics\.fillStyle\(0x1a1a1a, 0\.9\);[\s\S]*?menuGraphics\.fillRoundedRect\([^)]+\);"
$replacement = "// Yellow filled button`n    menuGraphics.fillStyle(0xffae00, 1);`n    menuGraphics.fillRoundedRect(x - buttonWidth / 2, menuY - buttonHeight / 2, buttonWidth, buttonHeight, 10);"
$content = $content -replace $pattern, $replacement

# Add Luckiest Guy font to leaderboard entries  
$content = $content -replace "fontSize: '16px',\s+color: '#ffffff'\s+\}", "fontSize: '18px',`n              color: '#ffffff',`n              fontFamily: 'Luckiest Guy'`n            }"

# Add Luckiest Guy font to wins text and increase font size
$content = $content -replace "fontSize: '18px',\s+color: '#FFD700'\s+\}\);", "fontSize: '20px',`n      color: '#FFD700',`n      fontFamily: 'Luckiest Guy'`n    });"

# Save the file
$content | Set-Content -Path "PongGameOverScene.ts" -NoNewline
