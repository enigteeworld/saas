// ============================================
// DISPATCH NG - Supabase Database Types
// Generated types for type-safe database operations
// ============================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          phone: string | null;
          full_name: string;
          avatar_url: string | null;
          user_type: 'customer' | 'rider' | 'admin';
          is_active: boolean;
          created_at: string;
          updated_at: string;
          last_login_at: string | null;
        };
        Insert: {
          id: string;
          email: string;
          phone?: string | null;
          full_name: string;
          avatar_url?: string | null;
          user_type: 'customer' | 'rider' | 'admin';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          last_login_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          phone?: string | null;
          full_name?: string;
          avatar_url?: string | null;
          user_type?: 'customer' | 'rider' | 'admin';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          last_login_at?: string | null;
        };
      };
      kyc_records: {
        Row: {
          id: string;
          profile_id: string;
          document_type: 'nin' | 'drivers_license' | 'passport' | 'voters_card' | 'cac';
          document_number: string | null;
          document_image_url: string | null;
          selfie_image_url: string | null;
          verification_status: 'pending' | 'verified' | 'rejected' | 'expired';
          verified_at: string | null;
          verified_by: string | null;
          rejection_reason: string | null;
          expiry_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          document_type: 'nin' | 'drivers_license' | 'passport' | 'voters_card' | 'cac';
          document_number?: string | null;
          document_image_url?: string | null;
          selfie_image_url?: string | null;
          verification_status?: 'pending' | 'verified' | 'rejected' | 'expired';
          verified_at?: string | null;
          verified_by?: string | null;
          rejection_reason?: string | null;
          expiry_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          document_type?: 'nin' | 'drivers_license' | 'passport' | 'voters_card' | 'cac';
          document_number?: string | null;
          document_image_url?: string | null;
          selfie_image_url?: string | null;
          verification_status?: 'pending' | 'verified' | 'rejected' | 'expired';
          verified_at?: string | null;
          verified_by?: string | null;
          rejection_reason?: string | null;
          expiry_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      rider_profiles: {
        Row: {
          id: string;
          profile_id: string;
          company_name: string | null;
          vehicle_type: 'motorcycle' | 'bicycle' | 'car' | 'van' | 'truck';
          vehicle_plate: string | null;
          vehicle_color: string | null;
          license_number: string | null;
          is_online: boolean;
          is_available: boolean;
          current_location: unknown | null;
          service_radius_km: number;
          total_deliveries: number;
          rating_average: number;
          total_earnings: number;
          verification_status: 'pending' | 'verified' | 'suspended' | 'rejected';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          company_name?: string | null;
          vehicle_type: 'motorcycle' | 'bicycle' | 'car' | 'van' | 'truck';
          vehicle_plate?: string | null;
          vehicle_color?: string | null;
          license_number?: string | null;
          is_online?: boolean;
          is_available?: boolean;
          current_location?: unknown | null;
          service_radius_km?: number;
          total_deliveries?: number;
          rating_average?: number;
          total_earnings?: number;
          verification_status?: 'pending' | 'verified' | 'suspended' | 'rejected';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          company_name?: string | null;
          vehicle_type?: 'motorcycle' | 'bicycle' | 'car' | 'van' | 'truck';
          vehicle_plate?: string | null;
          vehicle_color?: string | null;
          license_number?: string | null;
          is_online?: boolean;
          is_available?: boolean;
          current_location?: unknown | null;
          service_radius_km?: number;
          total_deliveries?: number;
          rating_average?: number;
          total_earnings?: number;
          verification_status?: 'pending' | 'verified' | 'suspended' | 'rejected';
          created_at?: string;
          updated_at?: string;
        };
      };
      bank_accounts: {
        Row: {
          id: string;
          profile_id: string;
          account_name: string;
          account_number: string;
          bank_name: string;
          bank_code: string | null;
          is_default: boolean;
          is_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          account_name: string;
          account_number: string;
          bank_name: string;
          bank_code?: string | null;
          is_default?: boolean;
          is_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          account_name?: string;
          account_number?: string;
          bank_name?: string;
          bank_code?: string | null;
          is_default?: boolean;
          is_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      wallets: {
        Row: {
          id: string;
          profile_id: string;
          available_balance: number;
          held_balance: number;
          total_deposited: number;
          total_withdrawn: number;
          currency: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          available_balance?: number;
          held_balance?: number;
          total_deposited?: number;
          total_withdrawn?: number;
          currency?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          available_balance?: number;
          held_balance?: number;
          total_deposited?: number;
          total_withdrawn?: number;
          currency?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      wallet_transactions: {
        Row: {
          id: string;
          wallet_id: string;
          transaction_type: 'deposit' | 'withdrawal' | 'escrow_lock' | 'escrow_release' | 'escrow_refund' | 'platform_fee' | 'adjustment' | 'dispute_hold' | 'dispute_release';
          amount: number;
          balance_before: number;
          balance_after: number;
          reference_id: string | null;
          reference_type: string | null;
          description: string | null;
          metadata: Json | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          transaction_type: 'deposit' | 'withdrawal' | 'escrow_lock' | 'escrow_release' | 'escrow_refund' | 'platform_fee' | 'adjustment' | 'dispute_hold' | 'dispute_release';
          amount: number;
          balance_before: number;
          balance_after: number;
          reference_id?: string | null;
          reference_type?: string | null;
          description?: string | null;
          metadata?: Json | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          wallet_id?: string;
          transaction_type?: 'deposit' | 'withdrawal' | 'escrow_lock' | 'escrow_release' | 'escrow_refund' | 'platform_fee' | 'adjustment' | 'dispute_hold' | 'dispute_release';
          amount?: number;
          balance_before?: number;
          balance_after?: number;
          reference_id?: string | null;
          reference_type?: string | null;
          description?: string | null;
          metadata?: Json | null;
          created_at?: string;
          created_by?: string | null;
        };
      };
      withdrawal_requests: {
        Row: {
          id: string;
          profile_id: string;
          wallet_id: string;
          bank_account_id: string;
          amount: number;
          status: 'pending' | 'approved' | 'processing' | 'paid' | 'failed' | 'rejected';
          processed_at: string | null;
          processed_by: string | null;
          rejection_reason: string | null;
          transaction_reference: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          wallet_id: string;
          bank_account_id: string;
          amount: number;
          status?: 'pending' | 'approved' | 'processing' | 'paid' | 'failed' | 'rejected';
          processed_at?: string | null;
          processed_by?: string | null;
          rejection_reason?: string | null;
          transaction_reference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          wallet_id?: string;
          bank_account_id?: string;
          amount?: number;
          status?: 'pending' | 'approved' | 'processing' | 'paid' | 'failed' | 'rejected';
          processed_at?: string | null;
          processed_by?: string | null;
          rejection_reason?: string | null;
          transaction_reference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      dispatch_jobs: {
        Row: {
          id: string;
          job_number: string;
          customer_id: string;
          rider_id: string | null;
          pickup_address: string;
          pickup_lat: number | null;
          pickup_lng: number | null;
          pickup_contact_name: string | null;
          pickup_contact_phone: string | null;
          pickup_notes: string | null;
          delivery_address: string;
          delivery_lat: number | null;
          delivery_lng: number | null;
          delivery_contact_name: string | null;
          delivery_contact_phone: string | null;
          delivery_notes: string | null;
          package_description: string | null;
          package_weight_kg: number | null;
          package_value: number | null;
          agreed_amount: number;
          platform_fee: number;
          rider_earnings: number;
          status: 'draft' | 'awaiting_rider' | 'awaiting_funding' | 'funded' | 'in_progress' | 'rider_marked_complete' | 'customer_marked_complete' | 'completed' | 'disputed' | 'cancelled' | 'refunded';
          created_at: string;
          rider_assigned_at: string | null;
          funded_at: string | null;
          started_at: string | null;
          rider_completed_at: string | null;
          customer_completed_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancellation_reason: string | null;
          delivery_otp: string | null;
          otp_verified: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_number?: string;
          customer_id: string;
          rider_id?: string | null;
          pickup_address: string;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          pickup_contact_name?: string | null;
          pickup_contact_phone?: string | null;
          pickup_notes?: string | null;
          delivery_address: string;
          delivery_lat?: number | null;
          delivery_lng?: number | null;
          delivery_contact_name?: string | null;
          delivery_contact_phone?: string | null;
          delivery_notes?: string | null;
          package_description?: string | null;
          package_weight_kg?: number | null;
          package_value?: number | null;
          agreed_amount: number;
          platform_fee: number;
          rider_earnings: number;
          status?: 'draft' | 'awaiting_rider' | 'awaiting_funding' | 'funded' | 'in_progress' | 'rider_marked_complete' | 'customer_marked_complete' | 'completed' | 'disputed' | 'cancelled' | 'refunded';
          created_at?: string;
          rider_assigned_at?: string | null;
          funded_at?: string | null;
          started_at?: string | null;
          rider_completed_at?: string | null;
          customer_completed_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cancellation_reason?: string | null;
          delivery_otp?: string | null;
          otp_verified?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_number?: string;
          customer_id?: string;
          rider_id?: string | null;
          pickup_address?: string;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          pickup_contact_name?: string | null;
          pickup_contact_phone?: string | null;
          pickup_notes?: string | null;
          delivery_address?: string;
          delivery_lat?: number | null;
          delivery_lng?: number | null;
          delivery_contact_name?: string | null;
          delivery_contact_phone?: string | null;
          delivery_notes?: string | null;
          package_description?: string | null;
          package_weight_kg?: number | null;
          package_value?: number | null;
          agreed_amount?: number;
          platform_fee?: number;
          rider_earnings?: number;
          status?: 'draft' | 'awaiting_rider' | 'awaiting_funding' | 'funded' | 'in_progress' | 'rider_marked_complete' | 'customer_marked_complete' | 'completed' | 'disputed' | 'cancelled' | 'refunded';
          created_at?: string;
          rider_assigned_at?: string | null;
          funded_at?: string | null;
          started_at?: string | null;
          rider_completed_at?: string | null;
          customer_completed_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cancellation_reason?: string | null;
          delivery_otp?: string | null;
          otp_verified?: boolean;
          updated_at?: string;
        };
      };
      escrow_records: {
        Row: {
          id: string;
          dispatch_job_id: string;
          customer_wallet_id: string;
          rider_wallet_id: string | null;
          locked_amount: number;
          platform_fee: number;
          status: 'not_created' | 'locked' | 'partially_released' | 'released' | 'refunded' | 'under_review';
          locked_at: string;
          released_at: string | null;
          refunded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dispatch_job_id: string;
          customer_wallet_id: string;
          rider_wallet_id?: string | null;
          locked_amount: number;
          platform_fee: number;
          status?: 'not_created' | 'locked' | 'partially_released' | 'released' | 'refunded' | 'under_review';
          locked_at?: string;
          released_at?: string | null;
          refunded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          dispatch_job_id?: string;
          customer_wallet_id?: string;
          rider_wallet_id?: string | null;
          locked_amount?: number;
          platform_fee?: number;
          status?: 'not_created' | 'locked' | 'partially_released' | 'released' | 'refunded' | 'under_review';
          locked_at?: string;
          released_at?: string | null;
          refunded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      job_status_history: {
        Row: {
          id: string;
          dispatch_job_id: string;
          status_from: string | null;
          status_to: string;
          changed_by: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          dispatch_job_id: string;
          status_from?: string | null;
          status_to: string;
          changed_by?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          dispatch_job_id?: string;
          status_from?: string | null;
          status_to?: string;
          changed_by?: string | null;
          notes?: string | null;
          created_at?: string;
        };
      };
      delivery_proofs: {
        Row: {
          id: string;
          dispatch_job_id: string;
          proof_type: 'photo' | 'signature' | 'otp' | 'note' | 'receipt';
          image_url: string | null;
          signature_data: string | null;
          notes: string | null;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          dispatch_job_id: string;
          proof_type: 'photo' | 'signature' | 'otp' | 'note' | 'receipt';
          image_url?: string | null;
          signature_data?: string | null;
          notes?: string | null;
          uploaded_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          dispatch_job_id?: string;
          proof_type?: 'photo' | 'signature' | 'otp' | 'note' | 'receipt';
          image_url?: string | null;
          signature_data?: string | null;
          notes?: string | null;
          uploaded_by?: string;
          created_at?: string;
        };
      };
      disputes: {
        Row: {
          id: string;
          dispatch_job_id: string;
          raised_by: string;
          dispute_type: 'not_delivered' | 'damaged' | 'wrong_item' | 'rider_no_show' | 'customer_no_show' | 'payment_issue' | 'other';
          description: string;
          status: 'open' | 'under_review' | 'resolved_customer_favor' | 'resolved_rider_favor' | 'resolved_split' | 'closed';
          resolution_notes: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          refund_amount: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dispatch_job_id: string;
          raised_by: string;
          dispute_type: 'not_delivered' | 'damaged' | 'wrong_item' | 'rider_no_show' | 'customer_no_show' | 'payment_issue' | 'other';
          description: string;
          status?: 'open' | 'under_review' | 'resolved_customer_favor' | 'resolved_rider_favor' | 'resolved_split' | 'closed';
          resolution_notes?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          refund_amount?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          dispatch_job_id?: string;
          raised_by?: string;
          dispute_type?: 'not_delivered' | 'damaged' | 'wrong_item' | 'rider_no_show' | 'customer_no_show' | 'payment_issue' | 'other';
          description?: string;
          status?: 'open' | 'under_review' | 'resolved_customer_favor' | 'resolved_rider_favor' | 'resolved_split' | 'closed';
          resolution_notes?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          refund_amount?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      dispute_evidence: {
        Row: {
          id: string;
          dispute_id: string;
          uploaded_by: string;
          evidence_type: 'image' | 'document' | 'chat' | 'other';
          file_url: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          dispute_id: string;
          uploaded_by: string;
          evidence_type: 'image' | 'document' | 'chat' | 'other';
          file_url?: string | null;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          dispute_id?: string;
          uploaded_by?: string;
          evidence_type?: 'image' | 'document' | 'chat' | 'other';
          file_url?: string | null;
          description?: string | null;
          created_at?: string;
        };
      };
      ratings: {
        Row: {
          id: string;
          dispatch_job_id: string;
          rider_id: string;
          customer_id: string;
          rating: number;
          review: string | null;
          is_visible: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dispatch_job_id: string;
          rider_id: string;
          customer_id: string;
          rating: number;
          review?: string | null;
          is_visible?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          dispatch_job_id?: string;
          rider_id?: string;
          customer_id?: string;
          rating?: number;
          review?: string | null;
          is_visible?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          profile_id: string;
          type: 'job_assigned' | 'job_funded' | 'job_started' | 'job_completed' | 'payment_received' | 'withdrawal_processed' | 'kyc_status' | 'dispute_opened' | 'system';
          title: string;
          message: string;
          data: Json | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          type: 'job_assigned' | 'job_funded' | 'job_started' | 'job_completed' | 'payment_received' | 'withdrawal_processed' | 'kyc_status' | 'dispute_opened' | 'system';
          title: string;
          message: string;
          data?: Json | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          type?: 'job_assigned' | 'job_funded' | 'job_started' | 'job_completed' | 'payment_received' | 'withdrawal_processed' | 'kyc_status' | 'dispute_opened' | 'system';
          title?: string;
          message?: string;
          data?: Json | null;
          is_read?: boolean;
          created_at?: string;
        };
      };
      admin_actions: {
        Row: {
          id: string;
          admin_id: string;
          action_type: string;
          target_table: string | null;
          target_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          action_type: string;
          target_table?: string | null;
          target_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          action_type?: string;
          target_table?: string | null;
          target_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          reason?: string | null;
          created_at?: string;
        };
      };
      platform_settings: {
        Row: {
          id: string;
          setting_key: string;
          setting_value: string;
          setting_type: 'string' | 'number' | 'boolean' | 'json';
          description: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          setting_key: string;
          setting_value: string;
          setting_type?: 'string' | 'number' | 'boolean' | 'json';
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          setting_key?: string;
          setting_value?: string;
          setting_type?: 'string' | 'number' | 'boolean' | 'json';
          description?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
      };
    };
    Views: {
      available_riders: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
          phone: string | null;
          company_name: string | null;
          vehicle_type: 'motorcycle' | 'bicycle' | 'car' | 'van' | 'truck';
          vehicle_color: string | null;
          rating_average: number;
          total_deliveries: number;
          lat: number;
          lng: number;
          service_radius_km: number;
        };
      };
      job_details: {
        Row: {
          id: string;
          job_number: string;
          customer_id: string;
          rider_id: string | null;
          pickup_address: string;
          pickup_lat: number | null;
          pickup_lng: number | null;
          pickup_contact_name: string | null;
          pickup_contact_phone: string | null;
          pickup_notes: string | null;
          delivery_address: string;
          delivery_lat: number | null;
          delivery_lng: number | null;
          delivery_contact_name: string | null;
          delivery_contact_phone: string | null;
          delivery_notes: string | null;
          package_description: string | null;
          package_weight_kg: number | null;
          package_value: number | null;
          agreed_amount: number;
          platform_fee: number;
          rider_earnings: number;
          status: string;
          created_at: string;
          rider_assigned_at: string | null;
          funded_at: string | null;
          started_at: string | null;
          rider_completed_at: string | null;
          customer_completed_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancellation_reason: string | null;
          delivery_otp: string | null;
          otp_verified: boolean;
          updated_at: string;
          customer_name: string;
          customer_phone: string | null;
          customer_avatar: string | null;
          rider_name: string | null;
          rider_phone: string | null;
          rider_avatar: string | null;
          escrow_status: string | null;
          locked_amount: number | null;
          escrow_released_at: string | null;
        };
      };
    };
    Functions: {
      update_updated_at_column: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      generate_job_number: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      log_job_status_change: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      create_wallet_for_profile: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      update_rider_rating: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
