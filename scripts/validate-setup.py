#!/usr/bin/env python3
"""Check the structure of the repository's engineering setup."""
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
issues = []
for relative in ("CLAUDE.md", "knowledge/SOURCES.md", ".claude/settings.json"):
    if not (root / relative).is_file():
        issues.append(f"Missing {relative}")

settings = root / ".claude/settings.json"
if settings.is_file():
    try:
        contents = json.loads(settings.read_text(encoding="utf-8"))
        deny = contents.get("permissions", {}).get("deny", [])
        if not isinstance(deny, list) or any(not isinstance(item, str) for item in deny):
            issues.append("Settings permissions.deny must be a list of strings")
    except (ValueError, AttributeError) as error:
        issues.append(f"Settings: {error}")

skills = sorted((root / ".claude/skills").glob("*/SKILL.md"))
agents = sorted((root / ".claude/agents").rglob("*.md"))
rules = sorted((root / ".claude/rules").rglob("*.md"))

for path in [*skills, *agents, *rules]:
    relative = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    if path in rules and not text.startswith("---\n"):
        if not text.strip():
            issues.append(f"{relative}: empty rule")
        continue
    opening, separator, footer = text[4:].partition("\n---\n")
    if not text.startswith("---\n") or not separator:
        issues.append(f"{relative}: malformed frontmatter")
        continue
    if path not in rules:
        fields = {line.split(":", 1)[0] for line in opening.splitlines() if ":" in line}
        if not {"name", "description"} <= fields:
            issues.append(f"{relative}: missing name or description")

for issue in issues:
    print(f"ERROR: {issue}", file=sys.stderr)
if issues:
    sys.exit(1)
print(f"PASS: {len(skills)} skills, {len(agents)} agents, {len(rules)} rules; setup structure verified.")
