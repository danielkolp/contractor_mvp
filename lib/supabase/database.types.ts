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
          client_name: string | null
          invoice_number: string
          project_name: string | null
          amount: number
          issue_date: string | null
          due_date: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          trade: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          client_id?: string | null
          client_name?: string | null
          invoice_number: string
          project_name?: string | null
          amount: number
          issue_date?: string | null
          due_date?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          trade?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string | null
          client_name?: string | null
          invoice_number?: string
          project_name?: string | null
          amount?: number
          issue_date?: string | null
          due_date?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          trade?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          company_name: string | null
          trade: string | null
          phone: string | null
          service_area: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_name?: string | null
          trade?: string | null
          phone?: string | null
          service_area?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_name?: string | null
          trade?: string | null
          phone?: string | null
          service_area?: string | null
          created_at?: string
          updated_at?: string
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      contact_method: "Email" | "Phone" | "Text"
      invoice_status:
        | "Draft"
        | "Sent"
        | "Overdue"
        | "Follow-up Sent"
        | "Payment Plan"
        | "Paid"
        | "Escalated"
      payment_reliability: "Reliable" | "Slow payer" | "High risk" | "New client"
      recovery_action_status: "Pending" | "Completed" | "Skipped" | "Cancelled"
      recovery_stage:
        | "newly_overdue"
        | "first_follow_up"
        | "second_follow_up"
        | "final_notice"
        | "escalated"
        | "resolved"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
