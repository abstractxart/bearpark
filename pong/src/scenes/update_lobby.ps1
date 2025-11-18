# Read the file
$content = Get-Content -Path "PongLobbyScene.ts" -Raw

# Update all text to use Luckiest Guy font
# Title
$content = $content -replace "const title = this\.add\.text\(width / 2, 100, 'BEAR PONG', \{[^}]+fontSize: '64px',\s+color: '#ffffff',\s+fontStyle: 'bold'", "const title = this.add.text(width / 2, 100, 'BEAR PONG', {`n      fontSize: '64px',`n      color: '#ffae00',`n      fontStyle: 'bold',`n      fontFamily: 'Luckiest Guy'"

# Subtitle  
$content = $content -replace "const subtitle = this\.add\.text\(width / 2, 180, 'Multiplayer Mode', \{[^}]+fontSize: '24px',\s+color: '#4a90e2'", "const subtitle = this.add.text(width / 2, 180, 'Multiplayer Mode', {`n      fontSize: '28px',`n      color: '#680cd9',`n      fontFamily: 'Luckiest Guy'"

# Status text
$content = $content -replace "this\.statusText = this\.add\.text\(width / 2, 400, 'Searching for opponent', \{[^}]+fontSize: '32px',\s+color: '#ffffff'", "this.statusText = this.add.text(width / 2, 400, 'Searching for opponent', {`n      fontSize: '36px',`n      color: '#ffffff',`n      fontFamily: 'Luckiest Guy'"

# Queue position text
$content = $content -replace "this\.queuePositionText = this\.add\.text\(width / 2, 460, '', \{[^}]+fontSize: '20px',\s+color: '#aaaaaa'", "this.queuePositionText = this.add.text(width / 2, 460, '', {`n      fontSize: '22px',`n      color: '#aaaaaa',`n      fontFamily: 'Luckiest Guy'"

# Instructions
$content = $content -replace "const instructions = this\.add\.text\(width / 2, height - 150, 'Waiting for another player to join\.\.\.', \{[^}]+fontSize: '18px',\s+color: '#888888',\s+align: 'center'", "const instructions = this.add.text(width / 2, height - 150, 'Waiting for another player to join...', {`n      fontSize: '20px',`n      color: '#888888',`n      align: 'center',`n      fontFamily: 'Luckiest Guy'"

# Back button
$content = $content -replace "const backButton = this\.add\.text\(width / 2, height - 80, '\[ ESC to Cancel \]', \{[^}]+fontSize: '16px',\s+color: '#ff6b6b'", "const backButton = this.add.text(width / 2, height - 80, '[ ESC to Cancel ]', {`n      fontSize: '18px',`n      color: '#ff6b6b',`n      fontFamily: 'Luckiest Guy'"

# Player name text
$content = $content -replace "const nameText = this\.add\.text\(0, 0, ``Player: \$\{displayName\}\``, \{[^}]+fontSize: '20px',\s+color: '#ffffff'", "const nameText = this.add.text(0, 0, ``Player: ${displayName}``, {`n      fontSize: '22px',`n      color: '#ffffff',`n      fontFamily: 'Luckiest Guy'"

# Stats text  
$content = $content -replace "this\.statsText = this\.add\.text\(0, 40, ``Wins: \$\{stats\.wins\}  \|  Losses: \$\{stats\.losses\}  \|  Win Rate: \$\{\(stats\.winRate \* 100\)\.toFixed\(1\)\}%\``, \{[^}]+fontSize: '16px',\s+color: '#4a90e2'", "this.statsText = this.add.text(0, 40, ``Wins: ${stats.wins}  |  Losses: ${stats.losses}  |  Win Rate: ${(stats.winRate * 100).toFixed(1)}%``, {`n      fontSize: '18px',`n      color: '#07ae08',`n      fontFamily: 'Luckiest Guy'"

# Cancel text
$content = $content -replace "const cancelText = this\.add\.text\([^}]+fontSize: '32px',\s+color: '#ffffff'", "const cancelText = this.add.text(`n      this.cameras.main.width / 2,`n      this.cameras.main.height / 2,`n      'Matchmaking Cancelled',`n      {`n        fontSize: '36px',`n        color: '#ffffff',`n        fontFamily: 'Luckiest Guy'"

# Save the file
$content | Set-Content -Path "PongLobbyScene.ts" -NoNewline
