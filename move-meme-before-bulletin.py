#!/usr/bin/env python3
"""Move Meme of the Week section BEFORE Bulletin Board section"""

# Read the file
with open('main.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines in file: {len(lines)}")

# Define boundaries with 0-based indexing
# Meme section: lines 9431-9556 (1-indexed) = indices 9430-9555
meme_start = 9430  # Line 9431 (1-indexed) - includes comment
meme_end = 9557    # Line 9557 (1-indexed) - includes blank line after modal

# Bulletin Board: line 9371 (1-indexed) = index 9370
bulletin_start = 9370  # Line 9371 (1-indexed) - the comment line

print(f"Extracting Meme section from line {meme_start+1} to {meme_end}")
print(f"Will insert before Bulletin Board at line {bulletin_start+1}")

# Extract the meme section (including comment and trailing blank)
meme_section = lines[meme_start:meme_end]
print(f"Meme section: {len(meme_section)} lines extracted")

# Verify we got the right content
if 'MEME OF THE WEEK' in meme_section[0]:
    print("SUCCESS: Found Meme section header")
else:
    print(f"ERROR: Expected Meme header, got: {meme_section[0][:50]}")
    exit(1)

if '</div>' in meme_section[-2]:
    print("SUCCESS: Found modal closing tag")
else:
    print(f"ERROR: Expected modal closing, got: {meme_section[-2][:50]}")
    exit(1)

# Remove meme section from original location
lines_without_meme = lines[:meme_start] + lines[meme_end:]
print(f"After removal: {len(lines_without_meme)} lines")

# Insert meme section at bulletin_start position (which is now at the same index since we removed content after it)
# Wait, we removed lines AFTER bulletin, so bulletin_start index is still the same
new_lines = lines_without_meme[:bulletin_start] + meme_section + lines_without_meme[bulletin_start:]
print(f"After insertion: {len(new_lines)} lines")

# Verify total line count is correct
if len(new_lines) == len(lines):
    print("SUCCESS: Line count matches original")
else:
    print(f"ERROR: Line count mismatch! Original: {len(lines)}, New: {len(new_lines)}")
    exit(1)

# Verify Bulletin Board is after Meme now
for i, line in enumerate(new_lines[bulletin_start:bulletin_start+150]):
    if 'MEME OF THE WEEK' in line:
        print(f"SUCCESS: Found Meme at position {bulletin_start + i + 1}")
    if 'BEAR BULLETIN BOARD' in line:
        print(f"SUCCESS: Found Bulletin Board at position {bulletin_start + i + 1}")
        break

# Write back to file
with open('main.html', 'w', encoding='utf-8', newline='') as f:
    f.writelines(new_lines)

print("\nSUCCESS: Meme of the Week section moved BEFORE Bulletin Board!")
print("Order is now: Leaderboards -> Meme of the Week -> Bulletin Board -> BEAR FRIENDS")
