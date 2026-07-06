-- Configurable display name for the 'mechanic' role (CLAUDE.md core rule: don't hardcode
-- "mechanic"). The role KEY stays 'mechanic' internally; only the label shown in the UI
-- changes. Null → default "Mechanic". Examples: Technician, Agent, Worker, Specialist.
ALTER TABLE app_config ADD COLUMN mechanic_label TEXT;
