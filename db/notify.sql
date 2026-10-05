-- Durable worker wake-up hint. Tasks/events remain the source of truth.
CREATE OR REPLACE FUNCTION notify_brain_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('brain_events', json_build_object(
    'id',NEW.id,'type',NEW.type,'project_id',NEW.project_id,'task_id',NEW.task_id
  )::text);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS brain_events_notify ON brain_events;
CREATE TRIGGER brain_events_notify
AFTER INSERT ON brain_events
FOR EACH ROW EXECUTE FUNCTION notify_brain_event();