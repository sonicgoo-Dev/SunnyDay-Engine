-- The wall between workspaces (rule 1). Every table in the "ws" schema is
-- put behind it with: select core.put_behind_wall('ws.<table>');
-- After that the database shows and accepts a row only when the
-- transaction carries that row's workspace number (app.workspace_id, set
-- by inWorkspace). FORCE makes the rule apply to the table's owner too,
-- which is the user the app connects as.
CREATE OR REPLACE FUNCTION core.put_behind_wall(tbl regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS workspace_wall ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY workspace_wall ON %s
       USING (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid)
       WITH CHECK (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid)',
    tbl);
END;
$$;
--> statement-breakpoint
SELECT core.put_behind_wall('ws.setting');
