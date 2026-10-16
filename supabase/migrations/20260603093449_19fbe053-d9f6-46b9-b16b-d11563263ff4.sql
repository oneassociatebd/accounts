-- ========== Mushak 4.3 Item Master ==========
CREATE TABLE public.mushak_4_3_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mushak_4_3_items TO authenticated;
GRANT ALL ON public.mushak_4_3_items TO service_role;

ALTER TABLE public.mushak_4_3_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage mushak_4_3_items"
ON public.mushak_4_3_items
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "auth read mushak_4_3_items"
ON public.mushak_4_3_items
FOR SELECT TO authenticated
USING (true);

CREATE TRIGGER mushak_4_3_items_updated_at
BEFORE UPDATE ON public.mushak_4_3_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed default items
INSERT INTO public.mushak_4_3_items (item_name) VALUES
  ('Coal'), ('Limestone'), ('Clinker'), ('Gypsum'), ('Others');

-- ========== Mushak 4.3 Submissions ==========
CREATE TABLE public.mushak_4_3_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id text NOT NULL UNIQUE,
  customer_id uuid NOT NULL,
  reference_id uuid,
  tax_period text NOT NULL,
  tax_period_date date NOT NULL,
  submission_date date NOT NULL DEFAULT CURRENT_DATE,
  item_name text NOT NULL,
  boe_no text NOT NULL,
  boe_date date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINALIZED')),
  sms_sent boolean NOT NULL DEFAULT false,
  remarks text,
  created_by uuid,
  updated_by uuid,
  finalized_by uuid,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_m43_customer ON public.mushak_4_3_submissions(customer_id);
CREATE INDEX idx_m43_reference ON public.mushak_4_3_submissions(reference_id);
CREATE INDEX idx_m43_status ON public.mushak_4_3_submissions(status);
CREATE INDEX idx_m43_tax_period_date ON public.mushak_4_3_submissions(tax_period_date);
CREATE INDEX idx_m43_boe_date ON public.mushak_4_3_submissions(boe_date);
CREATE INDEX idx_m43_submission_date ON public.mushak_4_3_submissions(submission_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mushak_4_3_submissions TO authenticated;
GRANT ALL ON public.mushak_4_3_submissions TO service_role;

ALTER TABLE public.mushak_4_3_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage mushak_4_3_submissions"
ON public.mushak_4_3_submissions
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "manager read mushak_4_3_submissions"
ON public.mushak_4_3_submissions
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.customer_managers cm
        WHERE cm.customer_id = mushak_4_3_submissions.customer_id
          AND cm.manager_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "manager create mushak_4_3_submissions"
ON public.mushak_4_3_submissions
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'manager'::app_role)
  AND created_by = auth.uid()
);

CREATE POLICY "manager update mushak_4_3_submissions"
ON public.mushak_4_3_submissions
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::app_role)
  AND (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.customer_managers cm
      WHERE cm.customer_id = mushak_4_3_submissions.customer_id
        AND cm.manager_id = auth.uid()
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'manager'::app_role)
  AND (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.customer_managers cm
      WHERE cm.customer_id = mushak_4_3_submissions.customer_id
        AND cm.manager_id = auth.uid()
    )
  )
);

CREATE TRIGGER mushak_4_3_submissions_updated_at
BEFORE UPDATE ON public.mushak_4_3_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();