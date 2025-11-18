# Read the file
$content = Get-Content -Path "PongLobbyScene.ts" -Raw

# Add preload method after constructor
$constructorPattern = "constructor\(\) \{[\s\S]*?\}\s+"
$preloadMethod = @"
  preload() {
    // Load background image
    this.load.image('lobby-bg', 'https://files.catbox.moe/qnp7wc.png');
  }

"@
$content = $content -replace $constructorPattern, "$&$preloadMethod"

# Replace black rectangle with background image
$content = $content -replace "// Background\s+this\.add\.rectangle\(0, 0, width, height, 0x000000\)\.setOrigin\(0\);", @"
// Background image
    const bg = this.add.image(width / 2, height / 2, 'lobby-bg');
    bg.setDisplaySize(width, height);
"@

# Fix player stats - restore the variables
$content = $content -replace "const nameText = this\.add\.text\(0, 0, ``Player: \``, \{", "const nameText = this.add.text(0, 0, ``Player: ${displayName}``, {"
$content = $content -replace "this\.statsText = this\.add\.text\(0, 40, ``Wins:   \|  Losses:   \|  Win Rate: %\``, \{", "this.statsText = this.add.text(0, 40, ``Wins: ${stats.wins}  |  Losses: ${stats.losses}  |  Win Rate: ${(stats.winRate * 100).toFixed(1)}%``, {"

# Replace ESC to Cancel button with RETURN TO BEARPARK button
$content = $content -replace "// Back button[\s\S]*?const backButton = this\.add\.text\(width / 2, height - 80, '\[ ESC to Cancel \]', \{[^}]+\}\);[\s\S]*?backButton\.setOrigin\(0\.5\);[\s\S]*?backButton\.setInteractive\(\{ useHandCursor: true \}\);[\s\S]*?backButton\.on\('pointerdown', \(\) => \{[\s\S]*?this\.cancelMatchmaking\(\);[\s\S]*?\}\);", @"
// RETURN TO BEARPARK button
    const returnButton = this.add.graphics();
    const buttonWidth = width * 0.6;
    const buttonHeight = 55;
    const buttonY = height - 80;
    
    returnButton.fillStyle(0xd94141, 1);
    returnButton.fillRoundedRect(width / 2 - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, 10);
    
    const returnText = this.add.text(width / 2, buttonY, 'RETURN TO BEARPARK', {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: 'Luckiest Guy'
    });
    returnText.setOrigin(0.5);
    returnText.setInteractive({ useHandCursor: true });
    returnText.on('pointerdown', () => {
      this.cancelMatchmaking();
    });
    
    returnText.on('pointerover', () => {
      returnButton.clear();
      returnButton.fillStyle(0xff5555, 1);
      returnButton.fillRoundedRect(width / 2 - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, 10);
    });
    
    returnText.on('pointerout', () => {
      returnButton.clear();
      returnButton.fillStyle(0xd94141, 1);
      returnButton.fillRoundedRect(width / 2 - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, 10);
    });
"@

# Save the file
$content | Set-Content -Path "PongLobbyScene.ts" -NoNewline
