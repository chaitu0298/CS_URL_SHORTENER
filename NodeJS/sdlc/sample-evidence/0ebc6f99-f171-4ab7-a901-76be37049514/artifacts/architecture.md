# Architecture / change design

Scenario: greenfield
Risk: medium
Touched modules: src/server.mjs, src/postgres-store.mjs

Changes are prepared in an isolated workspace, validated with executable tests, then submitted to two human approval gates. Production infrastructure and credentials are never accessed by this runner.
