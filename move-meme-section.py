#!/usr/bin/env python3
"""Move the Meme of the Week section between Leaderboards and Bulletin Board"""

# Read the file
with open('main.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the sections
# Leaderboards section ends around line 9369 (0-indexed: 9368)
# Meme section is from line 9431-9556 (0-indexed: 9430-9555)
# Bulletin Board starts at line 9371 (0-indexed: 9370)

# Extract the meme section (lines 9430-9555, inclusive)
meme_section_start = 9430  # Line 9431 (1-indexed)
meme_section_end = 9556    # Line 9557 (1-indexed) - one past the last line
meme_section = lines[meme_section_start:meme_section_end]

# Remove the meme section from its current location
lines_without_meme = lines[:meme_section_start] + lines[meme_section_end:]

# Find where to insert (after leaderboards, before bulletin board)
# After removing meme section, the bulletin board comment "<!-- BEAR BULLETIN BOARD -->"
# will be at a different line number
# Original line 9371 is "<!-- BEAR BULLETIN BOARD -->"
# After removing lines 9430-9555 (126 lines), line 9371 becomes line 9371 (stays same since it's before the removed section)

insert_position = 9370  # Right before "<!-- BEAR BULLETIN BOARD -->" (0-indexed)

# Insert the meme section at the new position
new_lines = lines_without_meme[:insert_position] + meme_section + lines_without_meme[insert_position:]

# Write back to file
with open('main.html', 'w', encoding='utf-8', newline='') as f:
    f.writelines(new_lines)

print("SUCCESS: Meme of the Week section moved successfully!")
print("Moved from line 9431 to position between Leaderboards and Bulletin Board")
