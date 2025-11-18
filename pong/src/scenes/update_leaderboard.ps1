# Read the file
$content = Get-Content -Path "PongGameOverScene.ts" -Raw

# Replace the getLeaderboard call from 5 to 10
$content = $content -replace 'PongAPI\.getLeaderboard\(5\)', 'PongAPI.getLeaderboard(10)'

# Replace the title text
$content = $content -replace "const title = this\.add\.text\(0, 0, 'Top Players',", "const title = this.add.text(0, 0, '🏆 TOP 10 PLAYERS 🏆',"

# Save the file
$content | Set-Content -Path "PongGameOverScene.ts" -NoNewline
