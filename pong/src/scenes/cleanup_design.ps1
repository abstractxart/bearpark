# Read the file
$content = Get-Content -Path "PongGameOverScene.ts" -Raw

# Remove the gradient arc circles - find and remove the arc drawing code
$content = $content -replace "graphics\.lineStyle\(5, 0xffae00, 1\);[\s\S]*?graphics\.strokePath\(\);[\s\S]*?graphics\.lineStyle\(5, 0x07ae08, 1\);[\s\S]*?graphics\.strokePath\(\);", ""

# Update leaderboard entry font to Luckiest Guy
$content = $content -replace "const entryText = this\.add\.text\([^}]+fontSize: '16px',\s+color: '#ffffff'", "const entryText = this.add.text(`n            0,`n            40 + index * 30,`n            ``${index + 1}. ${displayName} - ${wins}W ${losses}L``,`n            {`n              fontSize: '18px',`n              color: '#ffffff',`n              fontFamily: 'Luckiest Guy'"

# Add Luckiest Guy font to wins text
$content = $content -replace "const winsText = this\.add\.text\(x, y \+ 40, ``🏆 \$\{stats\.wins\} WIN\$\{stats\.wins !== 1 \? 'S' : ''\}\``, \{[^}]+fontSize: '18px',\s+color: '#FFD700'", "const winsText = this.add.text(x, y + 40, ``🏆 ${stats.wins} WIN${stats.wins !== 1 ? 'S' : ''}``, {`n      fontSize: '20px',`n      color: '#FFD700',`n      fontFamily: 'Luckiest Guy'"

# Save the file
$content | Set-Content -Path "PongGameOverScene.ts" -NoNewline
