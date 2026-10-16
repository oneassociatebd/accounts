-- Add memo number counter columns to company_settings (parallel to invoice counter)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS last_memo_number integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_memo_year integer,
  ADD COLUMN IF NOT EXISTS starting_memo_number integer NOT NULL DEFAULT 1;

-- ============== collections ==============
CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no text NOT NULL UNIQUE,
  customer_id uuid NOT NULL,
  collection_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'CASH',
  reference_no text,
  notes text,
  status text NOT NULL DEFAULT 'ACTIVE',
  collected_by uuid,
  created_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage collections"
ON public.collections FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "manager create collections"
ON public.collections FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "admin or manager-own read collections"
ON public.collections FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR (
    has_role(auth.uid(), 'manager'::app_role) AND (
      created_by = auth.uid() OR
      EXISTS (SELECT 1 FROM customer_managers cm
              WHERE cm.customer_id = collections.customer_id AND cm.manager_id = auth.uid())
    )
  )
);

CREATE TRIGGER set_collections_updated_at
BEFORE UPDATE ON public.collections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_collections_customer ON public.collections(customer_id);
CREATE INDEX idx_collections_date ON public.collections(collection_date DESC);
CREATE INDEX idx_collections_status ON public.collections(status);

-- ============== collection_allocations ==============
CREATE TABLE public.collection_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL,
  bill_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_allocations TO authenticated;
GRANT ALL ON public.collection_allocations TO service_role;

ALTER TABLE public.collection_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage collection_allocations"
ON public.collection_allocations FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "manager manage own collection_allocations"
ON public.collection_allocations FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) AND EXISTS (
    SELECT 1 FROM collections c
    WHERE c.id = collection_allocations.collection_id AND c.created_by = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) AND EXISTS (
    SELECT 1 FROM collections c
    WHERE c.id = collection_allocations.collection_id AND c.created_by = auth.uid()
  )
);

CREATE POLICY "admin or manager-own read collection_allocations"
ON public.collection_allocations FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR (
    has_role(auth.uid(), 'manager'::app_role) AND EXISTS (
      SELECT 1 FROM collections c
      WHERE c.id = collection_allocations.collection_id AND c.created_by = auth.uid()
    )
  )
);

CREATE INDEX idx_collection_allocations_collection ON public.collection_allocations(collection_id);
CREATE INDEX idx_collection_allocations_bill ON public.collection_allocations(bill_id);