-- Create income_sources table
CREATE TABLE public.income_sources (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_sources TO authenticated;
GRANT ALL ON public.income_sources TO service_role;

-- Create policy
CREATE POLICY "Allow authenticated users to manage income sources"
ON public.income_sources
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Add source_id to others_income
ALTER TABLE public.others_income 
ADD COLUMN source_id UUID REFERENCES public.income_sources(id);

-- Add updated_at trigger for income_sources
CREATE TRIGGER update_income_sources_updated_at
BEFORE UPDATE ON public.income_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
