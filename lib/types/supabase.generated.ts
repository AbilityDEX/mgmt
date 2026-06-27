export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      archive_delivery_logs: {
        Row: {
          archive_id: string | null
          archive_last_error: string | null
          archive_reference: string | null
          archive_status: string | null
          archive_timestamp: string | null
          archived: boolean
          created_at: string
          email_sent: boolean
          failure_reason: string | null
          id: string
          inspection_id: string
          pdf_generated: boolean
          recipient_snapshot: Json
          retry_count: number
          status: string
        }
        Insert: {
          archive_id?: string | null
          archive_last_error?: string | null
          archive_reference?: string | null
          archive_status?: string | null
          archive_timestamp?: string | null
          archived?: boolean
          created_at?: string
          email_sent?: boolean
          failure_reason?: string | null
          id?: string
          inspection_id: string
          pdf_generated?: boolean
          recipient_snapshot?: Json
          retry_count?: number
          status: string
        }
        Update: {
          archive_id?: string | null
          archive_last_error?: string | null
          archive_reference?: string | null
          archive_status?: string | null
          archive_timestamp?: string | null
          archived?: boolean
          created_at?: string
          email_sent?: boolean
          failure_reason?: string | null
          id?: string
          inspection_id?: string
          pdf_generated?: boolean
          recipient_snapshot?: Json
          retry_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "archive_delivery_logs_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "inspection_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_delivery_logs_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_jobs: {
        Row: {
          archive_delivery_log_id: string | null
          archive_id: string | null
          archive_last_error: string | null
          archive_reference: string | null
          archive_status: string
          archive_timestamp: string | null
          created_at: string
          id: string
          inspection_id: string | null
          next_retry_at: string | null
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          archive_delivery_log_id?: string | null
          archive_id?: string | null
          archive_last_error?: string | null
          archive_reference?: string | null
          archive_status?: string
          archive_timestamp?: string | null
          created_at?: string
          id?: string
          inspection_id?: string | null
          next_retry_at?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          archive_delivery_log_id?: string | null
          archive_id?: string | null
          archive_last_error?: string | null
          archive_reference?: string | null
          archive_status?: string
          archive_timestamp?: string | null
          created_at?: string
          id?: string
          inspection_id?: string | null
          next_retry_at?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "archive_jobs_archive_delivery_log_id_fkey"
            columns: ["archive_delivery_log_id"]
            isOneToOne: false
            referencedRelation: "archive_delivery_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_jobs_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "inspection_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_jobs_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          created_at: string
          display_order: number
          id: string
          question: string
          question_type: string
          required: boolean
          template_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          question: string
          question_type?: string
          required?: boolean
          template_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          question?: string
          question_type?: string
          required?: boolean
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
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
      company_settings: {
        Row: {
          address: string | null
          company_name: string
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          report_accent_color: string
          report_footer: string | null
          report_primary_color: string
          telephone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          report_accent_color?: string
          report_footer?: string | null
          report_primary_color?: string
          telephone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          report_accent_color?: string
          report_footer?: string | null
          report_primary_color?: string
          telephone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      defects: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          inspection_id: string
          inspection_item_id: string
          machine_id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          inspection_id: string
          inspection_item_id: string
          machine_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          inspection_id?: string
          inspection_item_id?: string
          machine_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "defects_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_inspection_item_id_fkey"
            columns: ["inspection_item_id"]
            isOneToOne: true
            referencedRelation: "inspection_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      email_distribution_recipients: {
        Row: {
          created_at: string
          delivery_scope: string
          department_filter: string | null
          email: string
          enabled: boolean
          id: string
          machine_filter: string | null
          name: string
          recipient_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_scope?: string
          department_filter?: string | null
          email: string
          enabled?: boolean
          id?: string
          machine_filter?: string | null
          name: string
          recipient_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_scope?: string
          department_filter?: string | null
          email?: string
          enabled?: boolean
          id?: string
          machine_filter?: string | null
          name?: string
          recipient_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_distribution_recipients_machine_filter_fkey"
            columns: ["machine_filter"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      email_recipients: {
        Row: {
          created_at: string
          delivery_scope: string
          department_filter: string | null
          email: string
          enabled: boolean
          id: string
          machine_filter: string | null
          name: string
          recipient_type: string
          source_recipient_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_scope?: string
          department_filter?: string | null
          email: string
          enabled?: boolean
          id?: string
          machine_filter?: string | null
          name: string
          recipient_type: string
          source_recipient_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_scope?: string
          department_filter?: string | null
          email?: string
          enabled?: boolean
          id?: string
          machine_filter?: string | null
          name?: string
          recipient_type?: string
          source_recipient_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_recipients_machine_filter_fkey"
            columns: ["machine_filter"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_recipients_source_recipient_id_fkey"
            columns: ["source_recipient_id"]
            isOneToOne: false
            referencedRelation: "email_distribution_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          active: boolean
          body: string
          created_at: string
          id: string
          name: string
          signature: string
          subject: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          id?: string
          name: string
          signature: string
          subject: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          id?: string
          name?: string
          signature?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      inspection_archives: {
        Row: {
          archive_reference: string | null
          checksum: string | null
          content_type: string
          created_at: string
          file_name: string
          generated_at: string
          generated_by: string | null
          id: string
          inspection_id: string
          pdf_base64: string
        }
        Insert: {
          archive_reference?: string | null
          checksum?: string | null
          content_type?: string
          created_at?: string
          file_name: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          inspection_id: string
          pdf_base64: string
        }
        Update: {
          archive_reference?: string | null
          checksum?: string | null
          content_type?: string
          created_at?: string
          file_name?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          inspection_id?: string
          pdf_base64?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_archives_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: true
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_drafts: {
        Row: {
          auto_saved_at: string
          created_at: string
          current_question_index: number
          draft_data: Json
          id: string
          inspection_id: string
          progress_percent: number
          scroll_position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_saved_at?: string
          created_at?: string
          current_question_index?: number
          draft_data?: Json
          id?: string
          inspection_id: string
          progress_percent?: number
          scroll_position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_saved_at?: string
          created_at?: string
          current_question_index?: number
          draft_data?: Json
          id?: string
          inspection_id?: string
          progress_percent?: number
          scroll_position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_drafts_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_email_history: {
        Row: {
          archive_id: string | null
          created_at: string
          error_message: string | null
          id: string
          inspection_id: string
          recipient_email: string
          recipient_type: string
          sent_at: string | null
          status: string
          subject: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          archive_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          inspection_id: string
          recipient_email: string
          recipient_type?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          archive_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          inspection_id?: string
          recipient_email?: string
          recipient_type?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_email_history_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "inspection_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_email_history_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_email_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_items: {
        Row: {
          answer: string | null
          comments: string | null
          completed: boolean
          created_at: string
          display_order: number
          id: string
          inspection_id: string
          original_template_item_id: string | null
          question: string
          question_type: string
          required: boolean
        }
        Insert: {
          answer?: string | null
          comments?: string | null
          completed?: boolean
          created_at?: string
          display_order: number
          id?: string
          inspection_id: string
          original_template_item_id?: string | null
          question: string
          question_type?: string
          required?: boolean
        }
        Update: {
          answer?: string | null
          comments?: string | null
          completed?: boolean
          created_at?: string
          display_order?: number
          id?: string
          inspection_id?: string
          original_template_item_id?: string | null
          question?: string
          question_type?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_schedules: {
        Row: {
          active: boolean
          created_at: string
          custom_cron: string | null
          frequency: string
          id: string
          interval_value: number
          last_generated: string | null
          machine_template_id: string
          next_due: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          custom_cron?: string | null
          frequency: string
          id?: string
          interval_value?: number
          last_generated?: string | null
          machine_template_id: string
          next_due: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          custom_cron?: string | null
          frequency?: string
          id?: string
          interval_value?: number
          last_generated?: string | null
          machine_template_id?: string
          next_due?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_schedules_machine_template_id_fkey"
            columns: ["machine_template_id"]
            isOneToOne: true
            referencedRelation: "machine_inspection_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          archive_last_attempt_at: string | null
          archive_last_error: string | null
          archive_reference: string | null
          archive_retry_count: number
          archive_status: string
          archive_timestamp: string | null
          archived_at: string | null
          archived_reference: string | null
          checklist: Json
          completed_at: string | null
          completion_source: string | null
          created_at: string
          due_at: string | null
          generation_key: string | null
          id: string
          is_overdue: boolean
          machine_id: string
          operator_id: string
          operator_name: string
          schedule_id: string | null
          started_at: string | null
          started_by: string | null
          status: string
          template_id: string | null
          template_name: string | null
          template_version: number
          updated_at: string
        }
        Insert: {
          archive_last_attempt_at?: string | null
          archive_last_error?: string | null
          archive_reference?: string | null
          archive_retry_count?: number
          archive_status?: string
          archive_timestamp?: string | null
          archived_at?: string | null
          archived_reference?: string | null
          checklist: Json
          completed_at?: string | null
          completion_source?: string | null
          created_at?: string
          due_at?: string | null
          generation_key?: string | null
          id?: string
          is_overdue?: boolean
          machine_id: string
          operator_id: string
          operator_name: string
          schedule_id?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          template_id?: string | null
          template_name?: string | null
          template_version?: number
          updated_at?: string
        }
        Update: {
          archive_last_attempt_at?: string | null
          archive_last_error?: string | null
          archive_reference?: string | null
          archive_retry_count?: number
          archive_status?: string
          archive_timestamp?: string | null
          archived_at?: string | null
          archived_reference?: string | null
          checklist?: Json
          completed_at?: string | null
          completion_source?: string | null
          created_at?: string
          due_at?: string | null
          generation_key?: string | null
          id?: string
          is_overdue?: boolean
          machine_id?: string
          operator_id?: string
          operator_name?: string
          schedule_id?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          template_id?: string | null
          template_name?: string | null
          template_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "inspection_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_inspection_templates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          inspection_frequency: string
          machine_id: string
          template_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          inspection_frequency: string
          machine_id: string
          template_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          inspection_frequency?: string
          machine_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_inspection_templates_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_inspection_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_types: {
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
      machines: {
        Row: {
          active: boolean
          area: string
          assigned_user: string | null
          code: string | null
          created_at: string
          id: string
          inspection_deadline: string
          installation_date: string | null
          last_inspection: string | null
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          serial_number: string | null
          status: string
          template_id: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          area: string
          assigned_user?: string | null
          code?: string | null
          created_at?: string
          id?: string
          inspection_deadline?: string
          installation_date?: string | null
          last_inspection?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          serial_number?: string | null
          status?: string
          template_id?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          area?: string
          assigned_user?: string | null
          code?: string | null
          created_at?: string
          id?: string
          inspection_deadline?: string
          installation_date?: string | null
          last_inspection?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          serial_number?: string | null
          status?: string
          template_id?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machines_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          read: boolean
          related_machine_id: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          related_machine_id?: string | null
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          related_machine_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_machine_id_fkey"
            columns: ["related_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          role: string
          updated_at: string
          user_id: string
          username: string
          work_area: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          updated_at?: string
          user_id: string
          username: string
          work_area?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          updated_at?: string
          user_id?: string
          username?: string
          work_area?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          findings: string | null
          id: string
          inspection_id: string
          machine_id: string
          recommendations: string | null
          report_date: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          findings?: string | null
          id?: string
          inspection_id: string
          machine_id: string
          recommendations?: string | null
          report_date?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          findings?: string | null
          id?: string
          inspection_id?: string
          machine_id?: string
          recommendations?: string | null
          report_date?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_settings: {
        Row: {
          created_at: string
          custom_days: number | null
          id: string
          max_delivery_retries: number
          retention_days: number
          updated_at: string
          use_custom: boolean
        }
        Insert: {
          created_at?: string
          custom_days?: number | null
          id?: string
          max_delivery_retries?: number
          retention_days?: number
          updated_at?: string
          use_custom?: boolean
        }
        Update: {
          created_at?: string
          custom_days?: number | null
          id?: string
          max_delivery_retries?: number
          retention_days?: number
          updated_at?: string
          use_custom?: boolean
        }
        Relationships: []
      }
      scheduled_cleanup_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          started_at: string
          status: string
          summary: Json
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          started_at?: string
          status?: string
          summary?: Json
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          started_at?: string
          status?: string
          summary?: Json
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          role: string
          updated_at: string
          work_area: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string
          updated_at?: string
          work_area?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          updated_at?: string
          work_area?: string | null
        }
        Relationships: []
      }
      work_areas: {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bytea_to_text: { Args: { data: string }; Returns: string }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

