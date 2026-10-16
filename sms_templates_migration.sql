-- ============================================================
-- SMS Templates: table, RLS, grants, trigger, and seed (7 rows)
-- Apply in Lovable Cloud → Backend → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sms_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  body        text NOT NULL,
  variables   jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sms_templates TO authenticated;
GRANT ALL    ON public.sms_templates TO service_role;

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read sms_templates"   ON public.sms_templates;
DROP POLICY IF EXISTS "admin write sms_templates" ON public.sms_templates;

CREATE POLICY "auth read sms_templates"
  ON public.sms_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "admin write sms_templates"
  ON public.sms_templates FOR ALL
  TO authenticated
  USING      (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS set_sms_templates_updated_at ON public.sms_templates;
CREATE TRIGGER set_sms_templates_updated_at
  BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Seed 7 default templates (idempotent via ON CONFLICT) =====
INSERT INTO public.sms_templates (key, name, description, body, variables) VALUES
('bill_notification',
 'বিল নোটিফিকেশন',
 'বিল ফাইনালাইজ হলে কাস্টমারকে পাঠানো হয়',
 'আপনার {{month}} মাসের প্রদেয় {{current_bill}}/-, পূর্বের বকেয়া {{due}}/-, ডিসকাউন্ট {{discount}}/-, মোট প্রদেয় {{grand_total}}/-

{{sender_role}}
{{company_name}}',
 '["month","current_bill","due","discount","grand_total","sender_role","company_name"]'::jsonb),

('collection_receipt',
 'টাকা গ্রহণের রসিদ',
 'কালেকশন এন্ট্রি করার পরে কাস্টমারকে পাঠানো হয়',
 'আপনার প্রদেয় ছিল {{total_payable}}/-, পরিশোধিত {{paid}}/-, বকেয়া {{due}}/-

{{sender_role}}
{{company_name}}',
 '["total_payable","paid","due","sender_role","company_name"]'::jsonb),

('due_reminder',
 'বকেয়া রিমাইন্ডার',
 'বকেয়া আছে এমন কাস্টমারকে পাঠানো হয়',
 'প্রিয় মেসার্স {{customer_name}}। {{date}} পর্যন্ত আপনার বকেয়া {{due}}/- পরিশোধ করার জন্য অনুরোধ করা হলো।

{{sender_role}}
{{company_name}}',
 '["customer_name","date","due","sender_role","company_name"]'::jsonb),

('bkash_payment_link',
 'bKash পেমেন্ট লিংক',
 'bKash এ পেমেন্ট লিংক শেয়ার করার জন্য',
 'আপনার {{month}} মাসের বিল {{amount}}/- টাকা।
বিকাশে পরিশোধ করুন: {{url}}

{{company_name}}',
 '["month","amount","url","company_name"]'::jsonb),

('vat_submission',
 'VAT সাবমিশন',
 'VAT রিটার্ণ দাখিল হলে কাস্টমারকে পাঠানো হয়',
 'আপনার {{tax_period}} মাসের ভ্যাট রিটার্ণ অনলাইনে দাখিল করা হয়েছে। সাবমিশন আইডি-{{submission_id}}।

{{sender_role}}
{{company_name}}',
 '["tax_period","submission_id","sender_role","company_name"]'::jsonb),

('mushak_submission',
 'মুশক ৪.৩ সাবমিশন',
 'মূল্য ঘোষণা (মুশক ৪.৩) দাখিল হলে পাঠানো হয়',
 'আপনার প্রতিষ্ঠানের বিপরীতে {{boe_date}} তারিখে আনিত {{item_name}} এর মূল্য ঘোষণা দাখিল করা হয়েছে। সাবমিশন আইডি {{submission_id}}।

{{sender_role}}
{{company_name}}',
 '["boe_date","item_name","submission_id","sender_role","company_name"]'::jsonb),

('test_sms',
 'টেস্ট SMS',
 'SMS gateway test করার জন্য',
 '{{company_name}} থেকে টেস্ট এসএমএস। এসএমএস ইন্টিগ্রেশন কাজ করছে।',
 '["company_name"]'::jsonb)

ON CONFLICT (key) DO NOTHING;
