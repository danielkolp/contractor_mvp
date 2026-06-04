export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string
          user_id: string
          name: string
          company: string
          trade: string | null
          email: string | null
          phone: string | null
          notes: string | null
          total_billed: number | null
          unpaid_balance: number | null
          overdue_invoice_count: number | null
          last_contacted_date: string | null
          payment_reliability: Database["public"]["Enums"]["payment_reliability"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          company: string
          trade?: string | null
          email?: string | null
          phone?: string | null
          notes?: string | null
          total_billed?: number | null
          unpaid_balance?: number | null
          overdue_invoice_count?: number | null
          last_contacted_date?: string | null
          payment_reliability?: Database["public"]["Enums"]["payment_reliability"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          company?: string
          trade?: string | null
          email?: string | null
          phone?: string | null
          notes?: string | null
          total_billed?: number | null
          unpaid_balance?: number | null
          overdue_invoice_count?: number | null
          last_contacted_date?: string | null
          payment_reliability?: Database["public"]["Enums"]["payment_reliability"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          user_id: string
          client_id: string | null
          job_request_id: string | null
          client_name: string | null
          invoice_number: string
          project_name: string | null
          work_address: string | null
          scheduled_visit_type: "inspection" | "job_start" | "job_completion" | "site_visit" | null
          scheduled_visit_starts_at: string | null
          scheduled_visit_ends_at: string | null
          scheduled_visit_notes: string | null
          amount: number
          issue_date: string | null
          due_date: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          trade: string | null
          notes: string | null
          line_items: Json
          tax_rate: number
          tax_lines: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          client_id?: string | null
          job_request_id?: string | null
          client_name?: string | null
          invoice_number: string
          project_name?: string | null
          work_address?: string | null
          scheduled_visit_type?: "inspection" | "job_start" | "job_completion" | "site_visit" | null
          scheduled_visit_starts_at?: string | null
          scheduled_visit_ends_at?: string | null
          scheduled_visit_notes?: string | null
          amount: number
          issue_date?: string | null
          due_date?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          trade?: string | null
          notes?: string | null
          line_items?: Json
          tax_rate?: number
          tax_lines?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string | null
          job_request_id?: string | null
          client_name?: string | null
          invoice_number?: string
          project_name?: string | null
          work_address?: string | null
          scheduled_visit_type?: "inspection" | "job_start" | "job_completion" | "site_visit" | null
          scheduled_visit_starts_at?: string | null
          scheduled_visit_ends_at?: string | null
          scheduled_visit_notes?: string | null
          amount?: number
          issue_date?: string | null
          due_date?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          trade?: string | null
          notes?: string | null
          line_items?: Json
          tax_rate?: number
          tax_lines?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      estimates: {
        Row: {
          id: string
          user_id: string
          client_id: string | null
          job_request_id: string | null
          client_name: string | null
          work_address: string | null
          estimate_number: string
          amount: number
          status: Database["public"]["Enums"]["estimate_status"]
          sent_date: string
          follow_up_date: string | null
          scheduled_visit_type: "inspection" | "job_start" | "job_completion" | "site_visit" | null
          scheduled_visit_starts_at: string | null
          scheduled_visit_ends_at: string | null
          scheduled_visit_notes: string | null
          billing_type: string | null
          decline_reason: string | null
          decline_comment: string | null
          notes: string | null
          line_items: Json
          tax_rate: number
          tax_lines: Json
          contractor_amount_cents: number | null
          platform_fee_cents: number | null
          client_total_cents: number | null
          payment_status: string
          paid_at: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          gst_cents: number | null
          deposit_amount_cents: number | null
          deposit_percentage: number | null
          deposit_paid_at: string | null
          deposit_payment_intent_id: string | null
          job_completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          client_id?: string | null
          job_request_id?: string | null
          client_name?: string | null
          work_address?: string | null
          estimate_number: string
          amount: number
          status?: Database["public"]["Enums"]["estimate_status"]
          sent_date?: string
          follow_up_date?: string | null
          scheduled_visit_type?: "inspection" | "job_start" | "job_completion" | "site_visit" | null
          scheduled_visit_starts_at?: string | null
          scheduled_visit_ends_at?: string | null
          scheduled_visit_notes?: string | null
          billing_type?: string | null
          decline_reason?: string | null
          decline_comment?: string | null
          notes?: string | null
          line_items?: Json
          tax_rate?: number
          tax_lines?: Json
          contractor_amount_cents?: number | null
          platform_fee_cents?: number | null
          client_total_cents?: number | null
          gst_cents?: number | null
          deposit_amount_cents?: number | null
          deposit_percentage?: number | null
          deposit_paid_at?: string | null
          deposit_payment_intent_id?: string | null
          job_completed_at?: string | null
          payment_status?: string
          paid_at?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string | null
          job_request_id?: string | null
          client_name?: string | null
          work_address?: string | null
          estimate_number?: string
          amount?: number
          status?: Database["public"]["Enums"]["estimate_status"]
          sent_date?: string
          follow_up_date?: string | null
          scheduled_visit_type?: "inspection" | "job_start" | "job_completion" | "site_visit" | null
          scheduled_visit_starts_at?: string | null
          scheduled_visit_ends_at?: string | null
          scheduled_visit_notes?: string | null
          billing_type?: string | null
          decline_reason?: string | null
          decline_comment?: string | null
          notes?: string | null
          line_items?: Json
          tax_rate?: number
          tax_lines?: Json
          contractor_amount_cents?: number | null
          platform_fee_cents?: number | null
          client_total_cents?: number | null
          gst_cents?: number | null
          deposit_amount_cents?: number | null
          deposit_percentage?: number | null
          deposit_paid_at?: string | null
          deposit_payment_intent_id?: string | null
          job_completed_at?: string | null
          payment_status?: string
          paid_at?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_work_days: {
        Row: {
          id: string
          user_id: string
          estimate_id: string
          starts_at: string
          ends_at: string | null
          notes: string | null
          status: "scheduled" | "completed" | "cancelled"
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          estimate_id: string
          starts_at: string
          ends_at?: string | null
          notes?: string | null
          status?: "scheduled" | "completed" | "cancelled"
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          estimate_id?: string
          starts_at?: string
          ends_at?: string | null
          notes?: string | null
          status?: "scheduled" | "completed" | "cancelled"
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      contractor_reviews: {
        Row: {
          id: string
          contractor_id: string
          client_id: string
          job_request_id: string
          estimate_id: string | null
          rating: number
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          contractor_id: string
          client_id: string
          job_request_id: string
          estimate_id?: string | null
          rating: number
          comment?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          contractor_id?: string
          client_id?: string
          job_request_id?: string
          estimate_id?: string | null
          rating?: number
          comment?: string | null
          created_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          estimate_id: string
          contractor_id: string
          client_id: string | null
          contractor_amount_cents: number
          platform_fee_cents: number
          client_total_cents: number
          currency: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_connected_account_id: string | null
          stripe_event_id: string | null
          paid_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          estimate_id: string
          contractor_id: string
          client_id?: string | null
          contractor_amount_cents: number
          platform_fee_cents: number
          client_total_cents: number
          currency?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_connected_account_id?: string | null
          stripe_event_id?: string | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          estimate_id?: string
          contractor_id?: string
          client_id?: string | null
          contractor_amount_cents?: number
          platform_fee_cents?: number
          client_total_cents?: number
          currency?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_connected_account_id?: string | null
          stripe_event_id?: string | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          id: string
          type: string
          processed_at: string
          payload: Json | null
        }
        Insert: {
          id: string
          type: string
          processed_at?: string
          payload?: Json | null
        }
        Update: {
          id?: string
          type?: string
          processed_at?: string
          payload?: Json | null
        }
        Relationships: []
      }
      client_messages: {
        Row: {
          id: string
          job_request_id: string
          sender_id: string
          sender_role: "contractor" | "client"
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          job_request_id: string
          sender_id: string
          sender_role: "contractor" | "client"
          body: string
          created_at?: string
        }
        Update: {
          id?: string
          job_request_id?: string
          sender_id?: string
          sender_role?: "contractor" | "client"
          body?: string
          created_at?: string
        }
        Relationships: []
      }
      job_requests: {
        Row: {
          id: string
          client_id: string
          contractor_id: string | null
          client_name: string | null
          client_email: string | null
          client_phone: string | null
          title: string
          description: string
          address_street: string | null
          work_address: string | null
          scheduled_visit_type: "inspection" | "job_start" | "job_completion" | "site_visit" | null
          scheduled_visit_starts_at: string | null
          scheduled_visit_ends_at: string | null
          scheduled_visit_notes: string | null
          trade: string | null
          service_area: string
          urgency: Database["public"]["Enums"]["job_request_urgency"]
          budget_min: number | null
          budget_max: number | null
          contact_preference: string
          photo_notes: string | null
          photo_urls: string[]
          more_details_message: string | null
          more_details_response: string | null
          visit_client_proposed_at: string | null
          visit_client_notes: string | null
          contractor_decline_reason: string | null
          status: Database["public"]["Enums"]["job_request_status"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          contractor_id?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          title: string
          description: string
          address_street?: string | null
          work_address?: string | null
          scheduled_visit_type?: "inspection" | "job_start" | "job_completion" | "site_visit" | null
          scheduled_visit_starts_at?: string | null
          scheduled_visit_ends_at?: string | null
          scheduled_visit_notes?: string | null
          trade?: string | null
          service_area: string
          urgency?: Database["public"]["Enums"]["job_request_urgency"]
          budget_min?: number | null
          budget_max?: number | null
          contact_preference?: string
          photo_notes?: string | null
          photo_urls?: string[]
          more_details_message?: string | null
          more_details_response?: string | null
          visit_client_proposed_at?: string | null
          visit_client_notes?: string | null
          contractor_decline_reason?: string | null
          status?: Database["public"]["Enums"]["job_request_status"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          contractor_id?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          title?: string
          description?: string
          address_street?: string | null
          work_address?: string | null
          scheduled_visit_type?: "inspection" | "job_start" | "job_completion" | "site_visit" | null
          scheduled_visit_starts_at?: string | null
          scheduled_visit_ends_at?: string | null
          scheduled_visit_notes?: string | null
          trade?: string | null
          service_area?: string
          urgency?: Database["public"]["Enums"]["job_request_urgency"]
          budget_min?: number | null
          budget_max?: number | null
          contact_preference?: string
          photo_notes?: string | null
          photo_urls?: string[]
          more_details_message?: string | null
          more_details_response?: string | null
          visit_client_proposed_at?: string | null
          visit_client_notes?: string | null
          contractor_decline_reason?: string | null
          status?: Database["public"]["Enums"]["job_request_status"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_timeline_events: {
        Row: {
          id: string
          job_request_id: string
          contractor_id: string
          event_type: string
          title: string
          notes: string | null
          event_date: string
          created_at: string
        }
        Insert: {
          id?: string
          job_request_id: string
          contractor_id: string
          event_type?: string
          title: string
          notes?: string | null
          event_date?: string
          created_at?: string
        }
        Update: {
          id?: string
          job_request_id?: string
          contractor_id?: string
          event_type?: string
          title?: string
          notes?: string | null
          event_date?: string
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          role: Database["public"]["Enums"]["user_role"]
          company_name: string | null
          owner_name: string | null
          trade: string | null
          phone: string | null
          website: string | null
          service_area: string | null
          request_slug: string
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean
          stripe_charges_enabled: boolean
          stripe_payouts_enabled: boolean
          stripe_details_submitted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role?: Database["public"]["Enums"]["user_role"]
          company_name?: string | null
          owner_name?: string | null
          trade?: string | null
          phone?: string | null
          website?: string | null
          service_area?: string | null
          request_slug?: string
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean
          stripe_charges_enabled?: boolean
          stripe_payouts_enabled?: boolean
          stripe_details_submitted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          company_name?: string | null
          owner_name?: string | null
          trade?: string | null
          phone?: string | null
          website?: string | null
          service_area?: string | null
          request_slug?: string
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean
          stripe_charges_enabled?: boolean
          stripe_payouts_enabled?: boolean
          stripe_details_submitted?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_request_guest_access: {
        Row: {
          id: string
          job_request_id: string
          client_email: string
          token: string
          expires_at: string | null
          claimed_by: string | null
          claimed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          job_request_id: string
          client_email: string
          token: string
          expires_at?: string | null
          claimed_by?: string | null
          claimed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          job_request_id?: string
          client_email?: string
          token?: string
          expires_at?: string | null
          claimed_by?: string | null
          claimed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          id: string
          user_id: string
          default_payment_terms: number
          late_fee_percentage: number
          currency: string
          first_reminder_days: number
          second_reminder_days: number
          final_notice_days: number
          default_tone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          default_payment_terms?: number
          late_fee_percentage?: number
          currency?: string
          first_reminder_days?: number
          second_reminder_days?: number
          final_notice_days?: number
          default_tone?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          default_payment_terms?: number
          late_fee_percentage?: number
          currency?: string
          first_reminder_days?: number
          second_reminder_days?: number
          final_notice_days?: number
          default_tone?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      recovery_drafts: {
        Row: {
          id: string
          user_id: string
          client_id: string | null
          invoice_id: string
          channel: string
          message_body: string
          status: string
          recommended_action: string | null
          days_overdue: number
          provider_message_id: string | null
          created_at: string
          updated_at: string
          approved_at: string | null
          sent_at: string | null
          resolved_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          client_id?: string | null
          invoice_id: string
          channel?: string
          message_body: string
          status?: string
          recommended_action?: string | null
          days_overdue?: number
          provider_message_id?: string | null
          created_at?: string
          updated_at?: string
          approved_at?: string | null
          sent_at?: string | null
          resolved_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string | null
          invoice_id?: string
          channel?: string
          message_body?: string
          status?: string
          recommended_action?: string | null
          days_overdue?: number
          provider_message_id?: string | null
          created_at?: string
          updated_at?: string
          approved_at?: string | null
          sent_at?: string | null
          resolved_at?: string | null
        }
        Relationships: []
      }
      recovery_actions: {
        Row: {
          id: string
          user_id: string
          invoice_id: string | null
          stage: Database["public"]["Enums"]["recovery_stage"]
          action_type: string
          status: Database["public"]["Enums"]["recovery_action_status"]
          contact_method: Database["public"]["Enums"]["contact_method"]
          recommended_next_action: string | null
          notes: string | null
          scheduled_for: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          invoice_id?: string | null
          stage: Database["public"]["Enums"]["recovery_stage"]
          action_type: string
          status?: Database["public"]["Enums"]["recovery_action_status"]
          contact_method?: Database["public"]["Enums"]["contact_method"]
          recommended_next_action?: string | null
          notes?: string | null
          scheduled_for?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          invoice_id?: string | null
          stage?: Database["public"]["Enums"]["recovery_stage"]
          action_type?: string
          status?: Database["public"]["Enums"]["recovery_action_status"]
          contact_method?: Database["public"]["Enums"]["contact_method"]
          recommended_next_action?: string | null
          notes?: string | null
          scheduled_for?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          id: string
          user_id: string
          invoice_id: string
          reminder_date: string
          scheduled_for: string
          reminder_type: string
          contact_method: string
          status: string
          sent_at: string | null
          completed: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          invoice_id: string
          reminder_date: string
          scheduled_for: string
          reminder_type: string
          contact_method: string
          status?: string
          sent_at?: string | null
          completed?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          invoice_id?: string
          reminder_date?: string
          scheduled_for?: string
          reminder_type?: string
          contact_method?: string
          status?: string
          sent_at?: string | null
          completed?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      recovery_email_events: {
        Row: {
          id: string
          user_id: string
          recovery_item_id: string
          to_email: string
          subject: string
          body: string
          provider: string
          provider_message_id: string | null
          status: string
          error_message: string | null
          reply_to_email: string | null
          inbound_thread_key: string | null
          sent_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          recovery_item_id: string
          to_email: string
          subject: string
          body: string
          provider?: string
          provider_message_id?: string | null
          status?: string
          error_message?: string | null
          reply_to_email?: string | null
          inbound_thread_key?: string | null
          sent_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          recovery_item_id?: string
          to_email?: string
          subject?: string
          body?: string
          provider?: string
          provider_message_id?: string | null
          status?: string
          error_message?: string | null
          reply_to_email?: string | null
          inbound_thread_key?: string | null
          sent_at?: string
          created_at?: string
        }
        Relationships: []
      }
      recovery_email_replies: {
        Row: {
          id: string
          user_id: string
          recovery_item_id: string
          recovery_email_event_id: string | null
          from_email: string
          from_name: string | null
          to_email: string
          subject: string | null
          text_body: string | null
          html_body: string | null
          provider: string
          provider_email_id: string | null
          raw_payload: Json | null
          received_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          recovery_item_id: string
          recovery_email_event_id?: string | null
          from_email: string
          from_name?: string | null
          to_email: string
          subject?: string | null
          text_body?: string | null
          html_body?: string | null
          provider?: string
          provider_email_id?: string | null
          raw_payload?: Json | null
          received_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          recovery_item_id?: string
          recovery_email_event_id?: string | null
          from_email?: string
          from_name?: string | null
          to_email?: string
          subject?: string | null
          text_body?: string | null
          html_body?: string | null
          provider?: string
          provider_email_id?: string | null
          raw_payload?: Json | null
          received_at?: string
          created_at?: string
        }
        Relationships: []
      }
      recovery_items: {
        Row: {
          id: string
          user_id: string
          client_name: string
          client_email: string | null
          client_phone: string | null
          reason: "estimate_no_reply" | "invoice_overdue" | "maybe_later" | "work_not_paid" | "other"
          amount: number
          contacted_date: string | null
          status: "needs_follow_up" | "message_ready" | "sent" | "waiting" | "resolved" | "lost" | "archived"
          message_body: string | null
          check_back_date: string | null
          follow_up_count: number
          notes: string | null
          is_demo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          client_name: string
          client_email?: string | null
          client_phone?: string | null
          reason?: "estimate_no_reply" | "invoice_overdue" | "maybe_later" | "work_not_paid" | "other"
          amount?: number
          contacted_date?: string | null
          status?: "needs_follow_up" | "message_ready" | "sent" | "waiting" | "resolved" | "lost" | "archived"
          message_body?: string | null
          check_back_date?: string | null
          follow_up_count?: number
          notes?: string | null
          is_demo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          client_name?: string
          client_email?: string | null
          client_phone?: string | null
          reason?: "estimate_no_reply" | "invoice_overdue" | "maybe_later" | "work_not_paid" | "other"
          amount?: number
          contacted_date?: string | null
          status?: "needs_follow_up" | "message_ready" | "sent" | "waiting" | "resolved" | "lost" | "archived"
          message_body?: string | null
          check_back_date?: string | null
          follow_up_count?: number
          notes?: string | null
          is_demo?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      contractor_exists: {
        Args: { contractor_user_id: string }
        Returns: boolean
      }
      contractor_public_profile: {
        Args: { contractor_user_id: string }
        Returns: {
          company_name: string | null
          owner_name: string | null
          trade: string | null
          service_area: string | null
        }[]
      }
      contractor_profile_by_slug: {
        Args: { slug: string }
        Returns: {
          company_name: string | null
          owner_name: string | null
          trade: string | null
          service_area: string | null
        }[]
      }
      get_auth_user_id_by_email: {
        Args: { lookup_email: string }
        Returns: string | null
      }
    }
    Enums: {
      contact_method: "Email" | "Phone" | "Text"
      estimate_status:
        | "Draft"
        | "Sent"
        | "Follow-up Needed"
        | "Follow-up Sent"
        | "Interested"
        | "Accepted"
        | "Won"
        | "Declined"
        | "Lost"
        | "Archived"
      invoice_status:
        | "Draft"
        | "Sent"
        | "Overdue"
        | "Follow-up Sent"
        | "Payment Plan"
        | "Paid"
        | "Escalated"
      job_request_status:
        | "new"
        | "reviewed"
        | "needs_info"
        | "declined_by_contractor"
        | "inspection_scheduled"
        | "inspection_confirmed"
        | "visit_completed"
        | "estimate_created"
        | "accepted"
        | "declined"
        | "closed"
      job_request_urgency: "flexible" | "soon" | "urgent"
      payment_reliability: "Reliable" | "Slow payer" | "High risk" | "New client"
      recovery_action_status: "Pending" | "Completed" | "Skipped" | "Cancelled"
      recovery_stage:
        | "newly_overdue"
        | "first_follow_up"
        | "second_follow_up"
        | "final_notice"
        | "escalated"
        | "resolved"
      user_role: "contractor" | "client"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
