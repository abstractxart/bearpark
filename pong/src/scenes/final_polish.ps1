# Read the file
$content = Get-Content -Path "PongGameOverScene.ts" -Raw

# Make VICTORY/GAME OVER title even bigger
$content = $content -replace "fontSize: '56px',\s+color: this\.didWin", "fontSize: '64px',`n        color: this.didWin"

# Increase stroke for title
$content = $content -replace "gameOverText\.setStroke\('#000000', 4\)", "gameOverText.setStroke('#000000', 6)"

# Make YOUR SCORE text bigger
$content = $content -replace "const scoreTitle = this\.add\.text\(x, y - 30, 'YOUR SCORE', \{[^}]+fontSize: '22px'", "const scoreTitle = this.add.text(x, y - 30, 'YOUR SCORE', {`n      fontSize: '26px'"

# Make score value even bigger  
$content = $content -replace "const scoreValue = this\.add\.text\(x, y \+ 10, stats\.wins\.toString\(\), \{[^}]+fontSize: '52px'", "const scoreValue = this.add.text(x, y + 10, stats.wins.toString(), {`n      fontSize: '60px'"

# Increase leaderboard entry font size
$content = $content -replace "const entryText = this\.add\.text\([^}]+fontSize: '16px'", "const entryText = this.add.text(`n            0,`n            40 + index * 30,`n            ``${index + 1}. ${displayName} - ${wins}W ${losses}L``,`n            {`n              fontSize: '18px'"

# Make stars bigger
$content = $content -replace "const starSize = 40;", "const starSize = 48;"

# Save the file
$content | Set-Content -Path "PongGameOverScene.ts" -NoNewline
