# E2E from a clean Hermes installation

## Goal
Validate that a fresh Hermes instance can install/use the ARCA SiRADIG MCP + skill end-to-end.

## Checklist
1. Fresh Hermes install works (`hermes doctor`).
2. Repo cloned locally.
3. Env vars set in `~/.hermes/.env`:
   - ARCA_CUIT
   - ARCA_PASSWORD
   - ARCA_SIRADIG_USER_FULLNAME
4. MCP registered and visible.
5. Skill installed locally and loadable.
6. MCP healthcheck returns ready=true.
7. (Next milestone) real SiRADIG tools run successfully.

## Commands

```bash
# 1) Clone
cd /tmp
git clone <YOUR_GITHUB_URL> arca-siradig
cd arca-siradig

# 2) Register MCP
hermes mcp add arca-siradig --command python3 --args /tmp/arca-siradig/mcp/server.py
hermes mcp test arca-siradig

# 3) Install skill
mkdir -p ~/.hermes/skills/arca-siradig
cp integrations/hermes/skills/arca-siradig.SKILL.md ~/.hermes/skills/arca-siradig/SKILL.md

# 4) Start Hermes and load
hermes
# /reload-mcp
# /reload-skills
# /skill arca-siradig
```

## Expected current result (v0.2)
- `siradig_healthcheck`: implemented and validates env vars.
- Other `siradig_*` tools: declared but return `not_implemented` until next iteration.

## Publish prep
Before public release:
- Add LICENSE
- Add CONTRIBUTING.md
- Add release tags/changelog
- Implement real SiRADIG tools and mark v1.0
