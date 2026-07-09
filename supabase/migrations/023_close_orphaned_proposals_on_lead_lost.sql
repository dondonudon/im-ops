CREATE OR REPLACE FUNCTION close_draft_proposals_on_lead_lost()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'closed_lost' AND OLD.status IS DISTINCT FROM 'closed_lost' THEN
    UPDATE proposals
    SET
      status = 'lost',
      closed_at = NOW(),
      closed_reason = 'Lead closed as lost'
    WHERE
      lead_id = NEW.id
      AND status IN ('draft', 'sent', 'negotiating');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_close_proposals_on_lead_lost
AFTER UPDATE OF status ON leads
FOR EACH ROW
EXECUTE FUNCTION close_draft_proposals_on_lead_lost();
