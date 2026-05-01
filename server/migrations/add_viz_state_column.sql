ALTER TABLE agent_states ADD COLUMN IF NOT EXISTS viz_state_json jsonb DEFAULT NULL;
