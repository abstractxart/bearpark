# Read the file
$content = Get-Content -Path "PongGameOverScene.ts" -Raw

# Update rainbow gradient border colors to BEARpark colors
# Blue -> Purple (#680cd9 = 0x680cd9)
$content = $content -replace "graphics\.lineStyle\(4, 0x5555ff, 1\)", "graphics.lineStyle(5, 0x680cd9, 1)"

# Orange -> Yellow (#ffae00 = 0xffae00)
$content = $content -replace "graphics\.lineStyle\(4, 0xffaa00, 1\)", "graphics.lineStyle(5, 0xffae00, 1)"

# Green stays green but brighter (#07ae08 = 0x07ae08)
$content = $content -replace "graphics\.lineStyle\(4, 0x55ff55, 1\)", "graphics.lineStyle(5, 0x07ae08, 1)"

# Update button gradient borders similarly
# Purple, Yellow, Green for menu button
$content = $content -replace "menuGraphics\.lineStyle\(3, 0x5555ff, 1\)", "menuGraphics.lineStyle(4, 0x680cd9, 1)"
$content = $content -replace "menuGraphics\.lineStyle\(3, 0xffaa00, 1\)", "menuGraphics.lineStyle(4, 0xffae00, 1)"
$content = $content -replace "menuGraphics\.lineStyle\(3, 0x55ff55, 1\)", "menuGraphics.lineStyle(4, 0x07ae08, 1)"

# Increase "BACK TO BEARPARK" button font size
$content = $content -replace "menuText = this\.add\.text\(x, menuY, 'BACK TO BEARPARK', \{[^}]+fontSize: '20px'", "menuText = this.add.text(x, menuY, 'BACK TO BEARPARK', {`n      fontSize: '24px'"

# Make menu button text color yellow on hover
$content = $content -replace "menuText\.setColor\('#ffaa00'\)", "menuText.setColor('#ffae00')"

# Save the file
$content | Set-Content -Path "PongGameOverScene.ts" -NoNewline
