#!/usr/bin/env python3
"""Validate Claude setup artifacts without third-party packages."""
from pathlib import Path
import json, sys
root=Path(__file__).resolve().parents[1]
problems=[]
for required in ('CLAUDE.md','knowledge/SOURCES.md','.claude/settings.json'):
    if not (root/required).is_file(): problems.append(f'missing {required}')
try:
    settings=json.loads((root/'.claude/settings.json').read_text(encoding='utf-8'))
    assert isinstance(settings.get('permissions',{}).get('deny',[]),list)
except Exception as exc: problems.append(f'settings: {exc}')
for directory in ('.claude/skills','.claude/agents','.claude/rules'):
    for p in sorted((root/directory).rglob('*.md')):
        data=p.read_text(encoding='utf-8')
        if not data.startswith('---\n') or '\n---\n' not in data[4:]: problems.append(f'{p}: malformed frontmatter')
        if directory.endswith('skills') and p.name=='SKILL.md' and ('description:' not in data[:450] or 'name:' not in data[:450]): problems.append(f'{p}: missing name/description')
        if directory.endswith('agents') and ('description:' not in data[:450] or 'name:' not in data[:450]): problems.append(f'{p}: missing name/description')
print(f"Skills: {len(list((root/'.claude/skills').glob('*/SKILL.md')))}, agents: {len(list((root/'.claude/agents').glob('*.md')))}, rules: {len(list((root/'.claude/rules').glob('*.md')))}")
for issue in problems: print('ERROR:',issue)
if problems: sys.exit(1)
print('PASS: structural checks; live Claude Code compatibility still requires /doctor and skill invocation in your installation')
