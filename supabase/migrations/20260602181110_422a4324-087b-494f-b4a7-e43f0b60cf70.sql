
-- ============= vat_submissions =============
CREATE TABLE public.vat_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  tax_period text NOT NULL,        -- e.g. "Jul 2026"
  tax_period_date date NOT NULL,   -- normalized first-of-month for sorting/filtering
  submission_id text NOT NULL,
  remarks text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINALIZED')),
  submission_date date,
  finalized_at timestamptz,
  finalized_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vat_submissions_unique_customer_period UNIQUE (customer_id, tax_period_date)
);

CREATE INDEX idx_vat_submissions_customer ON public.vat_submissions(customer_id);
CREATE INDEX idx_vat_submissions_status ON public.vat_submissions(status);
CREATE INDEX idx_vat_submissions_period ON public.vat_submissions(tax_period_date);
CREATE INDEX idx_vat_submissions_created_by ON public.vat_submissions(created_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vat_submissions TO authenticated;
GRANT ALL ON public.vat_submissions TO service_role;

ALTER TABLE public.vat_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage vat_submissions"
  ON public.vat_submissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "manager read vat_submissions"
  ON public.vat_submissions FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    (has_role(auth.uid(), 'manager'::app_role) AND (
      created_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM customer_managers cm
        WHERE cm.customer_id = vat_submissions.customer_id
          AND cm.manager_id = auth.uid()
      )
    ))
  );

CREATE POLICY "manager create vat_submissions"
  ON public.vat_submissions FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role) AND created_by = auth.uid());

CREATE POLICY "manager update vat_submissions"
  ON public.vat_submissions FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role) AND (
      created_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM customer_managers cm
        WHERE cm.customer_id = vat_submissions.customer_id
          AND cm.manager_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role) AND (
      created_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM customer_managers cm
        WHERE cm.customer_id = vat_submissions.customer_id
          AND cm.manager_id = auth.uid()
      )
    )
  );

-- Managers may only DELETE drafts they own; finalized rows are admin-only.
CREATE POLICY "manager delete own drafts"
  ON public.vat_submissions FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND status = 'DRAFT'
    AND created_by = auth.uid()
  );

CREATE TRIGGER vat_submissions_set_updated_at
  BEFORE UPDATE ON public.vat_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= vat_sms_logs =============
CREATE TABLE public.vat_sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES public.vat_submissions(id) ON DELETE CASCADE,
  recipient_mobile text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
  provider_response text,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vat_sms_logs_submission ON public.vat_sms_logs(submission_id);
CREATE INDEX idx_vat_sms_logs_sent_at ON public.vat_sms_logs(sent_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vat_sms_logs TO authenticated;
GRANT ALL ON public.vat_sms_logs TO service_role;

ALTER TABLE public.vat_sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage vat_sms_logs"
  ON public.vat_sms_logs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "manager read vat_sms_logs"
  ON public.vat_sms_logs FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    (has_role(auth.uid(), 'manager'::app_role) AND EXISTS (
      SELECT 1 FROM vat_submissions s
      WHERE s.id = vat_sms_logs.submission_id
        AND (
          s.created_by = auth.uid() OR
          EXISTS (
            SELECT 1 FROM customer_managers cm
            WHERE cm.customer_id = s.customer_id AND cm.manager_id = auth.uid()
          )
        )
    ))
  );

-- ============= vat_audit_logs =============
CREATE TABLE public.vat_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  submission_id uuid,
  reference text,
  ip_address text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vat_audit_logs_created_at ON public.vat_audit_logs(created_at DESC);
CREATE INDEX idx_vat_audit_logs_user ON public.vat_audit_logs(user_id);

GRANT SELECT, INSERT ON public.vat_audit_logs TO authenticated;
GRANT ALL ON public.vat_audit_logs TO service_role;

ALTER TABLE public.vat_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read vat_audit_logs"
  ON public.vat_audit_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "manager read own vat_audit_logs"
  ON public.vat_audit_logs FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role) AND user_id = auth.uid()
  );
