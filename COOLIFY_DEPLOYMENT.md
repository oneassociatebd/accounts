# Coolify Deployment Guide (One Associate BD)

এই প্রজেক্টটি **Coolify**-তে সহজেই Docker-এর মাধ্যমে ডেপ্লয় করতে পারবেন।

---

## ধাপ ১: GitHub / Git Repository-তে পুশ করুন
আপনার কোডগুলো GitHub বা GitLab-এ পুশ করুন। নিশ্চিত করুন [Dockerfile](file:///c:/Users/mijan/Downloads/oneassociatebd/Dockerfile) এবং [.dockerignore](file:///c:/Users/mijan/Downloads/oneassociatebd/.dockerignore) ফাইল রিপোজিটরিতে আছে।

---

## ধাপ ২: Coolify-তে Application তৈরি করুন
1. Coolify ড্যাশবোর্ডে যান।
2. **Projects** > আপনার প্রজেক্ট সিলেক্ট করুন > **+ New** > **Application**।
3. **Public Repository** অথবা **Private Repository (GitHub App)** সিলেক্ট করে আপনার রিপোজিটরি বেছে নিন।
4. **Build Pack** হিসেবে সিলেক্ট করুন: `Dockerfile`।

---

## ধাপ ৩: Port Configuration
* **Ports Exposes**: `3000`
* Coolify নিজে থেকেই SSL (HTTPS) হ্যান্ডল করবে এবং ট্রাফিকের জন্য রিভার্স প্রক্সি কনফিগার করে নেবে।

---

## ধাপ ৪: Environment Variables যোগ করুন
Coolify-এর **Environment Variables** ট্যাবে নিচের ভ্যারিয়েবলগুলো যোগ করুন:

| Variable Name | Description |
| :--- | :--- |
| `VITE_SUPABASE_URL` | আপনার Supabase URL (যেমন: `https://ybadwbfhjhuwncjxkslj.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable Key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase Project ID |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (যদি ব্যাকএন্ডে লাগে) |

> **জরুরি টিপ (Build Time Variable):** 
> Vite বিল্ডের সময় `VITE_*` ভ্যারিয়েবলগুলোর প্রয়োজন হয়। Coolify-তে ভ্যারিয়েবল অ্যাড করার সময় **"Build Variable"** বা **"Available during build"** চেকবক্সটি অন রাখবেন।

---

## ধাপ ৫: Deploy করুন
* **Deploy** বাটনে ক্লিক করুন। 
* কয়েক মিনিটের মধ্যে Bun দিয়ে ডিপেনডেন্সি ইনস্টল হয়ে বিল্ড হবে এবং পোর্ট `3000`-এ অ্যাপটি লাইভ হয়ে যাবে!
