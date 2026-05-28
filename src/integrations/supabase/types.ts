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
      audit_log: {
        Row: {
          action_summary: string
          alternative_considered: string | null
          asc606_citation: string | null
          claude_input_tokens: number | null
          claude_model: string | null
          claude_output_tokens: number | null
          contract_id: string | null
          customer_pk: string | null
          decision_made: string | null
          event_type: string
          full_reasoning_text: string | null
          id: string
          je_id: string | null
          judgment_call: boolean
          metadata: Json | null
          policy_citation: string | null
          timestamp: string
          user_id: string | null
        }
        Insert: {
          action_summary: string
          alternative_considered?: string | null
          asc606_citation?: string | null
          claude_input_tokens?: number | null
          claude_model?: string | null
          claude_output_tokens?: number | null
          contract_id?: string | null
          customer_pk?: string | null
          decision_made?: string | null
          event_type: string
          full_reasoning_text?: string | null
          id?: string
          je_id?: string | null
          judgment_call?: boolean
          metadata?: Json | null
          policy_citation?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          action_summary?: string
          alternative_considered?: string | null
          asc606_citation?: string | null
          claude_input_tokens?: number | null
          claude_model?: string | null
          claude_output_tokens?: number | null
          contract_id?: string | null
          customer_pk?: string | null
          decision_made?: string | null
          event_type?: string
          full_reasoning_text?: string | null
          id?: string
          je_id?: string | null
          judgment_call?: boolean
          metadata?: Json | null
          policy_citation?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_customer_pk_fkey"
            columns: ["customer_pk"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_je_id_fkey"
            columns: ["je_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_code: string
          account_name: string
          account_type: string
          description: string | null
          is_active: boolean
          normal_balance: string
        }
        Insert: {
          account_code: string
          account_name: string
          account_type: string
          description?: string | null
          is_active?: boolean
          normal_balance: string
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string
          description?: string | null
          is_active?: boolean
          normal_balance?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          billing_terms: string | null
          created_at: string
          created_by: string | null
          customer_pk: string
          effective_date: string
          end_date: string
          has_minimum: boolean
          has_ramp: boolean
          id: string
          minimum_amount: number | null
          msa_storage_path: string
          parent_contract_id: string | null
          payment_terms: string | null
          ramp_terms_json: Json | null
          status: string
          term_months: number | null
          total_contract_value: number | null
        }
        Insert: {
          billing_terms?: string | null
          created_at?: string
          created_by?: string | null
          customer_pk: string
          effective_date: string
          end_date: string
          has_minimum?: boolean
          has_ramp?: boolean
          id?: string
          minimum_amount?: number | null
          msa_storage_path: string
          parent_contract_id?: string | null
          payment_terms?: string | null
          ramp_terms_json?: Json | null
          status?: string
          term_months?: number | null
          total_contract_value?: number | null
        }
        Update: {
          billing_terms?: string | null
          created_at?: string
          created_by?: string | null
          customer_pk?: string
          effective_date?: string
          end_date?: string
          has_minimum?: boolean
          has_ramp?: boolean
          id?: string
          minimum_amount?: number | null
          msa_storage_path?: string
          parent_contract_id?: string | null
          payment_terms?: string | null
          ramp_terms_json?: Json | null
          status?: string
          term_months?: number | null
          total_contract_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_customer_pk_fkey"
            columns: ["customer_pk"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_parent_contract_id_fkey"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          domain: string | null
          id: string
          legal_name: string
          primary_contact_email: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          domain?: string | null
          id?: string
          legal_name: string
          primary_contact_email?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          domain?: string | null
          id?: string
          legal_name?: string
          primary_contact_email?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          customer_pk: string
          exported_at: string | null
          id: string
          je_date: string
          je_number: string
          memo: string
          period: string
          posted_at: string | null
          posted_by: string | null
          reversed_by_je_id: string | null
          status: string
          supporting_memo_storage_path: string | null
          total_credit: number
          total_debit: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          customer_pk: string
          exported_at?: string | null
          id?: string
          je_date: string
          je_number: string
          memo: string
          period: string
          posted_at?: string | null
          posted_by?: string | null
          reversed_by_je_id?: string | null
          status?: string
          supporting_memo_storage_path?: string | null
          total_credit: number
          total_debit: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          customer_pk?: string
          exported_at?: string | null
          id?: string
          je_date?: string
          je_number?: string
          memo?: string
          period?: string
          posted_at?: string | null
          posted_by?: string | null
          reversed_by_je_id?: string | null
          status?: string
          supporting_memo_storage_path?: string | null
          total_credit?: number
          total_debit?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_customer_pk_fkey"
            columns: ["customer_pk"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_by_je_id_fkey"
            columns: ["reversed_by_je_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_code: string
          credit_amount: number
          customer_pk: string | null
          debit_amount: number
          description: string | null
          id: string
          journal_entry_id: string
          line_number: number
        }
        Insert: {
          account_code: string
          credit_amount?: number
          customer_pk?: string | null
          debit_amount?: number
          description?: string | null
          id?: string
          journal_entry_id: string
          line_number: number
        }
        Update: {
          account_code?: string
          credit_amount?: number
          customer_pk?: string | null
          debit_amount?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
          line_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["account_code"]
          },
          {
            foreignKeyName: "journal_entry_lines_customer_pk_fkey"
            columns: ["customer_pk"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ndr_signals: {
        Row: {
          created_at: string
          customer_pk: string
          description: string | null
          id: string
          period: string
          signal_strength: string
          signal_type: string
        }
        Insert: {
          created_at?: string
          customer_pk: string
          description?: string | null
          id?: string
          period: string
          signal_strength: string
          signal_type: string
        }
        Update: {
          created_at?: string
          customer_pk?: string
          description?: string | null
          id?: string
          period?: string
          signal_strength?: string
          signal_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ndr_signals_customer_pk_fkey"
            columns: ["customer_pk"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_obligations: {
        Row: {
          asc606_citation: string | null
          billing_type: string | null
          contract_id: string
          created_at: string
          description: string | null
          id: string
          intended_end_state_treatment: string | null
          is_distinct: boolean
          is_interim: boolean
          is_series: boolean
          po_name: string
          policy_citation: string | null
          recognition_basis: string | null
          recognition_pattern: string
          stream_classification: string | null
          transaction_price_allocated: number | null
          treatment_basis: string | null
          variable_consideration_treatment: string | null
        }
        Insert: {
          asc606_citation?: string | null
          billing_type?: string | null
          contract_id: string
          created_at?: string
          description?: string | null
          id?: string
          intended_end_state_treatment?: string | null
          is_distinct: boolean
          is_interim?: boolean
          is_series?: boolean
          po_name: string
          policy_citation?: string | null
          recognition_basis?: string | null
          recognition_pattern: string
          stream_classification?: string | null
          transaction_price_allocated?: number | null
          treatment_basis?: string | null
          variable_consideration_treatment?: string | null
        }
        Update: {
          asc606_citation?: string | null
          billing_type?: string | null
          contract_id?: string
          created_at?: string
          description?: string | null
          id?: string
          intended_end_state_treatment?: string | null
          is_distinct?: boolean
          is_interim?: boolean
          is_series?: boolean
          po_name?: string
          policy_citation?: string | null
          recognition_basis?: string | null
          recognition_pattern?: string
          stream_classification?: string | null
          transaction_price_allocated?: number | null
          treatment_basis?: string | null
          variable_consideration_treatment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_obligations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_schedule: {
        Row: {
          actual_amount: number | null
          actual_consumption_rate: number | null
          actual_consumption_unit_label: string | null
          actual_consumption_units: number | null
          contract_id: string
          forecast_amount: number
          forecast_basis: string | null
          id: string
          is_interim_recognition: boolean
          je_id: string | null
          performance_obligation_id: string
          period: string
          period_month: number | null
          period_year: number | null
          posted_at: string | null
          posted_by: string | null
          status: string
          treatment_basis: string | null
          variance_amount: number | null
        }
        Insert: {
          actual_amount?: number | null
          actual_consumption_rate?: number | null
          actual_consumption_unit_label?: string | null
          actual_consumption_units?: number | null
          contract_id: string
          forecast_amount?: number
          forecast_basis?: string | null
          id?: string
          is_interim_recognition?: boolean
          je_id?: string | null
          performance_obligation_id: string
          period: string
          period_month?: number | null
          period_year?: number | null
          posted_at?: string | null
          posted_by?: string | null
          status?: string
          treatment_basis?: string | null
          variance_amount?: number | null
        }
        Update: {
          actual_amount?: number | null
          actual_consumption_rate?: number | null
          actual_consumption_unit_label?: string | null
          actual_consumption_units?: number | null
          contract_id?: string
          forecast_amount?: number
          forecast_basis?: string | null
          id?: string
          is_interim_recognition?: boolean
          je_id?: string | null
          performance_obligation_id?: string
          period?: string
          period_month?: number | null
          period_year?: number | null
          posted_at?: string | null
          posted_by?: string | null
          status?: string
          treatment_basis?: string | null
          variance_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_schedule_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_schedule_je_id_fkey"
            columns: ["je_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_schedule_performance_obligation_id_fkey"
            columns: ["performance_obligation_id"]
            isOneToOne: false
            referencedRelation: "performance_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_schedule_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_uploads: {
        Row: {
          csv_storage_path: string
          customer_pk: string
          id: string
          period_month: number
          period_year: number
          raw_data_json: Json
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          csv_storage_path: string
          customer_pk: string
          id?: string
          period_month: number
          period_year: number
          raw_data_json: Json
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          csv_storage_path?: string
          customer_pk?: string
          id?: string
          period_month?: number
          period_year?: number
          raw_data_json?: Json
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_uploads_customer_pk_fkey"
            columns: ["customer_pk"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "accountant" | "viewer"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "accountant", "viewer"],
    },
  },
} as const
