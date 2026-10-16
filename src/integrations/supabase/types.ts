export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      areas: {
        Row: {
          area_name: string
          created_at: string
          id: string
          is_active: boolean
          location_id: string
          updated_at: string
        }
        Insert: {
          area_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_id: string
          updated_at?: string
        }
        Update: {
          area_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          bank_name: string | null
          branch_name: string | null
          created_at: string
          id: string
          initial_balance: number
          name: string
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          branch_name?: string | null
          created_at?: string
          id?: string
          initial_balance?: number
          name: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          branch_name?: string | null
          created_at?: string
          id?: string
          initial_balance?: number
          name?: string
        }
        Relationships: []
      }
      bill_items: {
        Row: {
          bill_id: string
          calculated_amount: number
          created_at: string
          final_amount: number
          id: string
          minimum_charge_used: number
          position: number
          qty: number
          rate_used: number
          service_item_id: string
        }
        Insert: {
          bill_id: string
          calculated_amount?: number
          created_at?: string
          final_amount?: number
          id?: string
          minimum_charge_used?: number
          position?: number
          qty: number
          rate_used?: number
          service_item_id: string
        }
        Update: {
          bill_id?: string
          calculated_amount?: number
          created_at?: string
          final_amount?: number
          id?: string
          minimum_charge_used?: number
          position?: number
          qty?: number
          rate_used?: number
          service_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_service_item_id_fkey"
            columns: ["service_item_id"]
            isOneToOne: false
            referencedRelation: "service_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          bill_date: string
          bill_no: string
          billing_month: string
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          discount_amount: number
          finalized_at: string | null
          grand_total: number
          id: string
          notes: string | null
          previous_balance: number
          public_token: string | null
          status: string
          subtotal: number
          updated_at: string
          whatsapp_sent_at: string | null
        }
        Insert: {
          bill_date?: string
          bill_no: string
          billing_month: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          discount_amount?: number
          finalized_at?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          previous_balance?: number
          public_token?: string | null
          status?: string
          subtotal?: number
          updated_at?: string
          whatsapp_sent_at?: string | null
        }
        Update: {
          bill_date?: string
          bill_no?: string
          billing_month?: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          discount_amount?: number
          finalized_at?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          previous_balance?: number
          public_token?: string | null
          status?: string
          subtotal?: number
          updated_at?: string
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      bkash_payments: {
        Row: {
          amount: number
          bill_id: string
          bkash_url: string | null
          collection_id: string | null
          created_at: string
          customer_id: string
          id: string
          initiated_by: string | null
          payment_id: string | null
          raw_response: Json | null
          status: string
          trx_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          bill_id: string
          bkash_url?: string | null
          collection_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          initiated_by?: string | null
          payment_id?: string | null
          raw_response?: Json | null
          status?: string
          trx_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bill_id?: string
          bkash_url?: string | null
          collection_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          initiated_by?: string | null
          payment_id?: string | null
          raw_response?: Json | null
          status?: string
          trx_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      collection_allocations: {
        Row: {
          amount: number
          bill_id: string
          collection_id: string
          created_at: string
          id: string
        }
        Insert: {
          amount: number
          bill_id: string
          collection_id: string
          created_at?: string
          id?: string
        }
        Update: {
          amount?: number
          bill_id?: string
          collection_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_allocations_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          amount: number
          bank_account_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          collected_by: string | null
          collection_date: string
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          notes: string | null
          payment_method: string
          receipt_no: string
          reference_no: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          collected_by?: string | null
          collection_date?: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          payment_method?: string
          receipt_no: string
          reference_no?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          collected_by?: string | null
          collection_date?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          payment_method?: string
          receipt_no?: string
          reference_no?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          allow_duplicate_mobile: boolean
          allow_negative_balance: boolean
          allow_partial_payment: boolean
          auto_collection_enable: boolean
          auto_due_carry_forward: boolean
          auto_logout: boolean
          auto_messaging_enabled: boolean
          bank_account_number: string | null
          bank_branch: string | null
          bank_name: string | null
          bin_number: string | null
          bin_unique_enforcement: boolean
          bkash_api_key: string | null
          bkash_callback_url: string | null
          bkash_merchant_number: string | null
          bkash_secret_key: string | null
          company_name: string
          created_at: string
          currency: string | null
          date_format: string
          decimal_places: number
          default_minimum_charge: number
          default_report_month: string
          default_tax_percent: number
          email: string | null
          enable_auto_assign: boolean
          enable_month_rule: boolean
          id: string
          include_disabled_cust: boolean
          invoice_active: boolean
          invoice_footer_text: string | null
          invoice_prefix: string | null
          invoice_terms: string | null
          language: string
          last_invoice_number: number
          last_invoice_year: number | null
          last_memo_number: number
          last_memo_year: number | null
          login_retry_limit: number
          logo_url: string | null
          memo_prefix: string
          password_policy: string
          payment_link_expiry_days: number
          payment_mode: string
          phone: string | null
          print_copies: string
          print_margin_bottom: number
          print_margin_left: number
          print_margin_right: number
          print_margin_top: number
          print_orientation: string | null
          print_page_size: string | null
          print_show_footer: boolean
          print_show_header: boolean
          print_show_logo: boolean
          print_signature_label: string | null
          print_signature_line: boolean
          print_signature_url: string | null
          sender_id: string | null
          session_timeout_minutes: number
          show_zero_balance: boolean
          sms_api_key: string | null
          starting_invoice_number: number
          starting_memo_number: number
          strict_role_mode: boolean
          tax_number: string | null
          timezone: string
          trade_license_no: string | null
          two_factor_auth: boolean
          updated_at: string
          vat_number: string | null
          vat_registration_no: string | null
          website: string | null
          whatsapp_api_key: string | null
        }
        Insert: {
          address?: string | null
          allow_duplicate_mobile?: boolean
          allow_negative_balance?: boolean
          allow_partial_payment?: boolean
          auto_collection_enable?: boolean
          auto_due_carry_forward?: boolean
          auto_logout?: boolean
          auto_messaging_enabled?: boolean
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          bin_number?: string | null
          bin_unique_enforcement?: boolean
          bkash_api_key?: string | null
          bkash_callback_url?: string | null
          bkash_merchant_number?: string | null
          bkash_secret_key?: string | null
          company_name?: string
          created_at?: string
          currency?: string | null
          date_format?: string
          decimal_places?: number
          default_minimum_charge?: number
          default_report_month?: string
          default_tax_percent?: number
          email?: string | null
          enable_auto_assign?: boolean
          enable_month_rule?: boolean
          id?: string
          include_disabled_cust?: boolean
          invoice_active?: boolean
          invoice_footer_text?: string | null
          invoice_prefix?: string | null
          invoice_terms?: string | null
          language?: string
          last_invoice_number?: number
          last_invoice_year?: number | null
          last_memo_number?: number
          last_memo_year?: number | null
          login_retry_limit?: number
          logo_url?: string | null
          memo_prefix?: string
          password_policy?: string
          payment_link_expiry_days?: number
          payment_mode?: string
          phone?: string | null
          print_copies?: string
          print_margin_bottom?: number
          print_margin_left?: number
          print_margin_right?: number
          print_margin_top?: number
          print_orientation?: string | null
          print_page_size?: string | null
          print_show_footer?: boolean
          print_show_header?: boolean
          print_show_logo?: boolean
          print_signature_label?: string | null
          print_signature_line?: boolean
          print_signature_url?: string | null
          sender_id?: string | null
          session_timeout_minutes?: number
          show_zero_balance?: boolean
          sms_api_key?: string | null
          starting_invoice_number?: number
          starting_memo_number?: number
          strict_role_mode?: boolean
          tax_number?: string | null
          timezone?: string
          trade_license_no?: string | null
          two_factor_auth?: boolean
          updated_at?: string
          vat_number?: string | null
          vat_registration_no?: string | null
          website?: string | null
          whatsapp_api_key?: string | null
        }
        Update: {
          address?: string | null
          allow_duplicate_mobile?: boolean
          allow_negative_balance?: boolean
          allow_partial_payment?: boolean
          auto_collection_enable?: boolean
          auto_due_carry_forward?: boolean
          auto_logout?: boolean
          auto_messaging_enabled?: boolean
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          bin_number?: string | null
          bin_unique_enforcement?: boolean
          bkash_api_key?: string | null
          bkash_callback_url?: string | null
          bkash_merchant_number?: string | null
          bkash_secret_key?: string | null
          company_name?: string
          created_at?: string
          currency?: string | null
          date_format?: string
          decimal_places?: number
          default_minimum_charge?: number
          default_report_month?: string
          default_tax_percent?: number
          email?: string | null
          enable_auto_assign?: boolean
          enable_month_rule?: boolean
          id?: string
          include_disabled_cust?: boolean
          invoice_active?: boolean
          invoice_footer_text?: string | null
          invoice_prefix?: string | null
          invoice_terms?: string | null
          language?: string
          last_invoice_number?: number
          last_invoice_year?: number | null
          last_memo_number?: number
          last_memo_year?: number | null
          login_retry_limit?: number
          logo_url?: string | null
          memo_prefix?: string
          password_policy?: string
          payment_link_expiry_days?: number
          payment_mode?: string
          phone?: string | null
          print_copies?: string
          print_margin_bottom?: number
          print_margin_left?: number
          print_margin_right?: number
          print_margin_top?: number
          print_orientation?: string | null
          print_page_size?: string | null
          print_show_footer?: boolean
          print_show_header?: boolean
          print_show_logo?: boolean
          print_signature_label?: string | null
          print_signature_line?: boolean
          print_signature_url?: string | null
          sender_id?: string | null
          session_timeout_minutes?: number
          show_zero_balance?: boolean
          sms_api_key?: string | null
          starting_invoice_number?: number
          starting_memo_number?: number
          strict_role_mode?: boolean
          tax_number?: string | null
          timezone?: string
          trade_license_no?: string | null
          two_factor_auth?: boolean
          updated_at?: string
          vat_number?: string | null
          vat_registration_no?: string | null
          website?: string | null
          whatsapp_api_key?: string | null
        }
        Relationships: []
      }
      customer_managers: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          customer_id: string
          id: string
          manager_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          customer_id: string
          id?: string
          manager_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          customer_id?: string
          id?: string
          manager_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_managers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          type_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          type_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          type_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_yearly_balances: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_due: number
          created_at: string
          customer_id: string
          id: string
          opening_due: number
          total_bills: number
          total_collections: number
          updated_at: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_due?: number
          created_at?: string
          customer_id: string
          id?: string
          opening_due?: number
          total_bills?: number
          total_collections?: number
          updated_at?: string
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_due?: number
          created_at?: string
          customer_id?: string
          id?: string
          opening_due?: number
          total_bills?: number
          total_collections?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          alternative_mobile: string | null
          area_id: string | null
          bin_number: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          customer_type_id: string
          disabled_at: string | null
          email: string | null
          enabled_month: string | null
          id: string
          is_active: boolean
          location_id: string | null
          mobile: string | null
          monthly_fee: number | null
          name: string
          notes: string | null
          opening_balance_amount: number
          opening_balance_type: string | null
          proprietor_name: string | null
          reference: string | null
          reference_id: string | null
          trade_license_no: string | null
          updated_at: string
          vat_password: string | null
          vat_registration_no: string | null
          vat_service_type: string
          vat_user_id: string | null
        }
        Insert: {
          address?: string | null
          alternative_mobile?: string | null
          area_id?: string | null
          bin_number?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_type_id?: string
          disabled_at?: string | null
          email?: string | null
          enabled_month?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          mobile?: string | null
          monthly_fee?: number | null
          name: string
          notes?: string | null
          opening_balance_amount?: number
          opening_balance_type?: string | null
          proprietor_name?: string | null
          reference?: string | null
          reference_id?: string | null
          trade_license_no?: string | null
          updated_at?: string
          vat_password?: string | null
          vat_registration_no?: string | null
          vat_service_type?: string
          vat_user_id?: string | null
        }
        Update: {
          address?: string | null
          alternative_mobile?: string | null
          area_id?: string | null
          bin_number?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_type_id?: string
          disabled_at?: string | null
          email?: string | null
          enabled_month?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          mobile?: string | null
          monthly_fee?: number | null
          name?: string
          notes?: string | null
          opening_balance_amount?: number
          opening_balance_type?: string | null
          proprietor_name?: string | null
          reference?: string | null
          reference_id?: string | null
          trade_license_no?: string | null
          updated_at?: string
          vat_password?: string | null
          vat_registration_no?: string | null
          vat_service_type?: string
          vat_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_customer_type_id_fkey"
            columns: ["customer_type_id"]
            isOneToOne: false
            referencedRelation: "customer_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "references"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          bank_account_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          expense_date: string
          id: string
          notes: string | null
          payment_method: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          payment_method: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          payment_method?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      income_sources: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      loan_contacts: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      loan_transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          created_at: string
          created_by: string | null
          id: string
          loan_id: string
          notes: string | null
          payment_method: string
          transaction_date: string
          type: Database["public"]["Enums"]["loan_transaction_type"]
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          loan_id: string
          notes?: string | null
          payment_method?: string
          transaction_date?: string
          type: Database["public"]["Enums"]["loan_transaction_type"]
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          loan_id?: string
          notes?: string | null
          payment_method?: string
          transaction_date?: string
          type?: Database["public"]["Enums"]["loan_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "loan_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_transactions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amount: number
          contact_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          interest_rate: number | null
          loan_date: string
          status: Database["public"]["Enums"]["loan_status"]
          type: Database["public"]["Enums"]["loan_type"]
          updated_at: string
        }
        Insert: {
          amount?: number
          contact_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          interest_rate?: number | null
          loan_date?: string
          status?: Database["public"]["Enums"]["loan_status"]
          type: Database["public"]["Enums"]["loan_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          contact_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          interest_rate?: number | null
          loan_date?: string
          status?: Database["public"]["Enums"]["loan_status"]
          type?: Database["public"]["Enums"]["loan_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "loan_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      manager_earnings: {
        Row: {
          amount: number
          bill_id: string
          bill_item_id: string
          billing_month: string
          created_at: string
          id: string
          manager_id: string
          payout_id: string | null
          qty: number
          rate: number
          service_item_id: string
          status: string
        }
        Insert: {
          amount?: number
          bill_id: string
          bill_item_id: string
          billing_month: string
          created_at?: string
          id?: string
          manager_id: string
          payout_id?: string | null
          qty?: number
          rate?: number
          service_item_id: string
          status?: string
        }
        Update: {
          amount?: number
          bill_id?: string
          bill_item_id?: string
          billing_month?: string
          created_at?: string
          id?: string
          manager_id?: string
          payout_id?: string | null
          qty?: number
          rate?: number
          service_item_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_earnings_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_earnings_bill_item_id_fkey"
            columns: ["bill_item_id"]
            isOneToOne: true
            referencedRelation: "bill_items"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_payouts: {
        Row: {
          account_info: string | null
          amount: number
          created_at: string
          created_by: string | null
          id: string
          manager_id: string
          notes: string | null
          paid_at: string
          payment_method: string
          period_month: string
          reference_no: string | null
          sms_response: string | null
          sms_sent_at: string | null
          sms_status: string | null
        }
        Insert: {
          account_info?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          manager_id: string
          notes?: string | null
          paid_at?: string
          payment_method: string
          period_month: string
          reference_no?: string | null
          sms_response?: string | null
          sms_sent_at?: string | null
          sms_status?: string | null
        }
        Update: {
          account_info?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          manager_id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: string
          period_month?: string
          reference_no?: string | null
          sms_response?: string | null
          sms_sent_at?: string | null
          sms_status?: string | null
        }
        Relationships: []
      }
      manager_service_rates: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          manager_id: string | null
          rate: number
          service_item_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          manager_id?: string | null
          rate?: number
          service_item_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          manager_id?: string | null
          rate?: number
          service_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_service_rates_service_item_id_fkey"
            columns: ["service_item_id"]
            isOneToOne: false
            referencedRelation: "service_items"
            referencedColumns: ["id"]
          },
        ]
      }
      mushak_4_3_items: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          item_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          item_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          item_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      mushak_4_3_submissions: {
        Row: {
          boe_date: string
          boe_no: string
          created_at: string
          created_by: string | null
          customer_id: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          item_name: string
          reference_id: string | null
          remarks: string | null
          sms_sent: boolean
          status: string
          submission_date: string
          submission_id: string
          tax_period: string
          tax_period_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          boe_date: string
          boe_no: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          item_name: string
          reference_id?: string | null
          remarks?: string | null
          sms_sent?: boolean
          status?: string
          submission_date?: string
          submission_id: string
          tax_period: string
          tax_period_date: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          boe_date?: string
          boe_no?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          item_name?: string
          reference_id?: string | null
          remarks?: string | null
          sms_sent?: boolean
          status?: string
          submission_date?: string
          submission_id?: string
          tax_period?: string
          tax_period_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      others_income: {
        Row: {
          amount: number
          bank_account_id: string | null
          created_at: string
          created_by: string | null
          id: string
          income_date: string
          notes: string | null
          payment_method: string
          source: string
          source_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          income_date?: string
          notes?: string | null
          payment_method: string
          source: string
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          income_date?: string
          notes?: string | null
          payment_method?: string
          source?: string
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "others_income_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "others_income_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "income_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          area_id: string | null
          created_at: string
          created_by: string | null
          email: string
          id: string
          is_active: boolean
          mobile: string | null
          name: string
          updated_at: string
          username: string
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          id: string
          is_active?: boolean
          mobile?: string | null
          name?: string
          updated_at?: string
          username: string
        }
        Update: {
          area_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean
          mobile?: string | null
          name?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      references: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          mobile_number: string | null
          reference_name: string
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          mobile_number?: string | null
          reference_name: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          mobile_number?: string | null
          reference_name?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          action: string
          allowed: boolean
          created_at: string
          id: string
          module: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          action: string
          allowed?: boolean
          created_at?: string
          id?: string
          module: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          action?: string
          allowed?: boolean
          created_at?: string
          id?: string
          module?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      service_items: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          item_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          item_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          item_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_rates: {
        Row: {
          created_at: string
          created_by: string | null
          customer_type_id: string | null
          effective_from: string
          id: string
          minimum_charge: number
          regular_rate: number
          service_item_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_type_id?: string | null
          effective_from: string
          id?: string
          minimum_charge: number
          regular_rate: number
          service_item_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_type_id?: string | null
          effective_from?: string
          id?: string
          minimum_charge?: number
          regular_rate?: number
          service_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_rates_customer_type_id_fkey"
            columns: ["customer_type_id"]
            isOneToOne: false
            referencedRelation: "customer_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_rates_service_item_id_fkey"
            columns: ["service_item_id"]
            isOneToOne: false
            referencedRelation: "service_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          body: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string
          name: string
          updated_at: string
          updated_by: string | null
          variables: Json
        }
        Insert: {
          body: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          name: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Update: {
          body?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Relationships: []
      }
      user_activity: {
        Row: {
          last_interaction_at: string | null
          last_path: string | null
          last_seen_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_interaction_at?: string | null
          last_path?: string | null
          last_seen_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_interaction_at?: string | null
          last_path?: string | null
          last_seen_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_areas: {
        Row: {
          area_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          area_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          area_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vat_audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          reference: string | null
          submission_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          reference?: string | null
          submission_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          reference?: string | null
          submission_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      vat_sms_logs: {
        Row: {
          id: string
          message: string
          provider_response: string | null
          recipient_mobile: string
          sent_at: string
          sent_by: string | null
          status: string
          submission_id: string | null
        }
        Insert: {
          id?: string
          message: string
          provider_response?: string | null
          recipient_mobile: string
          sent_at?: string
          sent_by?: string | null
          status?: string
          submission_id?: string | null
        }
        Update: {
          id?: string
          message?: string
          provider_response?: string | null
          recipient_mobile?: string
          sent_at?: string
          sent_by?: string | null
          status?: string
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vat_sms_logs_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "vat_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_submissions: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          remarks: string | null
          status: string
          submission_date: string | null
          submission_id: string
          tax_period: string
          tax_period_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          remarks?: string | null
          status?: string
          submission_date?: string | null
          submission_id: string
          tax_period: string
          tax_period_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          remarks?: string | null
          status?: string
          submission_date?: string | null
          submission_id?: string
          tax_period?: string
          tax_period_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_logs: {
        Row: {
          bill_id: string | null
          collection_id: string | null
          id: string
          message: string
          recipient_mobile: string
          response: string | null
          sent_at: string
          sent_by: string | null
          status: string
        }
        Insert: {
          bill_id?: string | null
          collection_id?: string | null
          id?: string
          message: string
          recipient_mobile: string
          response?: string | null
          sent_at?: string
          sent_by?: string | null
          status: string
        }
        Update: {
          bill_id?: string | null
          collection_id?: string | null
          id?: string
          message?: string
          recipient_mobile?: string
          response?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_logs_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_logs_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_db_size: { Args: never; Returns: number }
      get_storage_files: {
        Args: never
        Returns: {
          bucket_id: string
          name: string
          size_bytes: number
          updated_at: string
        }[]
      }
      get_storage_size: { Args: never; Returns: number }
      get_table_sizes: {
        Args: never
        Returns: {
          row_count: number
          size_bytes: number
          table_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      restore_backup_chunk: {
        Args: { p_rows: Json; p_table: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "manager"
      loan_status: "ACTIVE" | "PAID" | "DEFAULTED"
      loan_transaction_type: "REPAYMENT" | "COLLECTION" | "INTEREST"
      loan_type: "taken" | "given"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager"],
      loan_status: ["ACTIVE", "PAID", "DEFAULTED"],
      loan_transaction_type: ["REPAYMENT", "COLLECTION", "INTEREST"],
      loan_type: ["taken", "given"],
    },
  },
} as const
