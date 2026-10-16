# Self-Hosted Supabase & Coolify Complete Migration Guide

এই গাইডের মাধ্যমে আপনার নিজের সার্ভারে (Coolify) নিজস্ব **PostgreSQL + Supabase** সার্ভিস চালু করে পূর্বের সমস্ত ডেটা মাইগ্রেট করতে পারবেন।

---

## পর্ব ১: আগের সাইট থেকে ডেটা ব্যাকআপ নেওয়া
1. আপনার বর্তমান লাইভ সিস্টেমে Admin হিসেবে লগইন করুন।
2. মেন্যু থেকে **Settings** > **System Info** (`/settings/system-info`) পেজে যান।
3. **Storage Files** সেকশনের পাশে থাকা **"Download SQL"** বাটনে ক্লিক করুন।
4. একটি `database-backup-....sql` ফাইল আপনার কম্পিউটারে সেভ হবে। (এতে সমস্ত গ্রাহক, বিল, পেমেন্ট ও ভাউচারের সম্পূর্ণ ডেটা আছে)।

---

## পর্ব ২: Coolify-তে নিজস্ব Supabase ডিপ্লয় করা
1. আপনার Coolify ড্যাশবোর্ডে লগইন করুন।
2. **Projects** > আপনার প্রজেক্ট বাদে সিলেক্ট করে **+ New Resource** বা **+ New Service**-এ ক্লিক করুন।
3. সার্চ বক্সে টাইপ করুন **Supabase** এবং সিলেক্ট করুন।
4. আপনার পছন্দমতো ডোমেন নাম দিন (যেমন: `supabase.yourdomain.com`)।
5. **Deploy** বাটনে ক্লিক করুন।
6. ডিপ্লয় শেষ হলে Coolify আপনাকে নিচের ক্রেডেনশিয়ালগুলো প্রদান করবে:
   * **Kong URL / API URL** (যেমন: `https://supabase.yourdomain.com` অথবা আইপি পোর্ট)
   * **Anon / Public Key**
   * **Service Role Key**
   * **Studio URL** (Supabase Web Dashboard)

---

## পর্ব ৩: নতুন ডেটাবেজে স্কিমা ও ফাংশন তৈরি করা
1. আপনার নতুন সেলফ-হোস্টেড Supabase-এর **Studio Dashboard** ওপেন করুন।
2. বাম পাশের মেন্যু থেকে **SQL Editor** ট্যাবে ক্লিক করুন এবং **+ New Query** খুলুন।
3. প্রথমে প্রজেক্টে থাকা [clean_schema.sql](file:///c:/Users/mijan/Downloads/oneassociatebd/clean_schema.sql) ফাইলের কোডগুলো পেস্ট করে **Run** করুন।
   *(এতে সব টেবিল, কলাম, ট্রিগার ও নিরাপত্তা পলিসি তৈরি হয়ে যাবে)*।
4. এরপর প্রজেক্টে তৈরি করা [self_hosted_setup.sql](file:///c:/Users/mijan/Downloads/oneassociatebd/self_hosted_setup.sql) ফাইলের কোডগুলো পেস্ট করে **Run** করুন।
   *(এতে ব্যাকআপ রিস্টোর ফাংশন এবং ইমেজ/সিগনেচার স্টোরেজ বাকেট তৈরি হবে)*।

---

## পর্ব ৪: Admin ইউজার তৈরি করা
Studio-র **Authentication** > **Users** ট্যাবে গিয়ে **Add User** বাটনে ক্লিক করে আপনার Admin ইমেইল ও পাসওয়ার্ড তৈরি করে নিন (যেমন আপনার আগের লগইন ইমেইল)।

অথবা SQL Editor-এ রান করতে পারেন:
```sql
-- Profiles এবং user_roles-এ আপনার নতুন ইউজারের এডমিন রোল সেট করুন:
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'YOUR_EMAIL@gmail.com'
ON CONFLICT DO NOTHING;
```

---

## পর্ব ৫: Coolify-তে ওয়েব অ্যাপ্লিকেশন কানেক্ট ও ডেপ্লয় করা
1. Coolify-তে আপনার ওয়েব অ্যাপ্লিকেশনে (Application) যান।
2. **Environment Variables** ট্যাবে নতুন ভ্যারিয়েবলগুলো আপডেট করুন:
   * `VITE_SUPABASE_URL` = `আপনার নতুন Supabase API URL`
   * `VITE_SUPABASE_PUBLISHABLE_KEY` = `আপনার নতুন Supabase Anon Key`
   * `SUPABASE_SERVICE_ROLE_KEY` = `আপনার নতুন Service Role Key`
   *(সবগুলোতে **Build Variable** অপশন টিক দিন)*।
3. **Deploy** বাটনে ক্লিক করুন।

---

## পর্ব ৬: পূর্বে ডাউনলোড করা ডেটা রিস্টোর করা
1. আপনার নতুন ডেপ্লয় হওয়া ওয়েব সাইটে এডমিন হিসেবে লগইন করুন।
2. **Settings** > **System Info** পেজে যান।
3. **"Upload SQL"** বাটনে ক্লিক করে **পর্ব ১**-এ ডাউনলোড করা `database-backup-....sql` ফাইলটি সিলেক্ট করে দিন।
4. কয়েক সেকেন্ডের মধ্যে আপনার নিজস্ব সার্ভারে সম্পূর্ণ ডেটা রিস্টোর হয়ে যাবে! 🎉
