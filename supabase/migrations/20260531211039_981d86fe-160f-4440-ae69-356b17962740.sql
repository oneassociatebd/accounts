ALTER TABLE public.collections
  ADD CONSTRAINT collections_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT,
  ADD CONSTRAINT collections_collected_by_fkey
    FOREIGN KEY (collected_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT collections_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT collections_cancelled_by_fkey
    FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.collection_allocations
  ADD CONSTRAINT collection_allocations_collection_id_fkey
    FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE,
  ADD CONSTRAINT collection_allocations_bill_id_fkey
    FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE CASCADE;