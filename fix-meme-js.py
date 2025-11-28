#!/usr/bin/env python3
"""Fix meme JavaScript in main.html"""

# Read the fixed JS
with open('meme-fix.js', 'r', encoding='utf-8') as f:
    fixed_js = f.read()

# Read main.html
with open('main.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find start and end markers
start_marker = '  <!-- ===== MEME OF THE WEEK JAVASCRIPT ===== -->\n  <script>\n'
end_marker = '\n  </script>\n  <!-- ===== END MEME OF THE WEEK JAVASCRIPT ===== -->'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("ERROR: Could not find markers")
    exit(1)

# Replace the content
new_content = (
    content[:start_idx + len(start_marker)] +
    fixed_js +
    content[end_idx:]
)

# Write back
with open('main.html', 'w', encoding='utf-8', newline='') as f:
    f.write(new_content)

print("Fixed meme JavaScript in main.html")
