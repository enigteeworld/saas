// ============================================
// DISPATCH NG - Format Utilities
// ============================================

import { format, formatDistanceToNow as formatDistance } from 'date-fns';

/**
 * Format currency in Naira
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-NG').format(num);
}

/**
 * Format date to readable string
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d, yyyy');
}

/**
 * Format date with time
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d, yyyy • h:mm a');
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatDistanceToNow(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistance(d, { addSuffix: true });
}

/**
 * Format phone number to Nigerian format
 */
export function formatPhone(phone: string): string {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  // If starts with 0, replace with +234
  if (cleaned.startsWith('0')) {
    return '+234' + cleaned.slice(1);
  }
  
  // If already starts with 234, add +
  if (cleaned.startsWith('234')) {
    return '+' + cleaned;
  }
  
  return '+' + cleaned;
}

/**
 * Format vehicle type for display
 */
export function formatVehicleType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Format job status for display
 */
export function formatJobStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Get status color class
 */
export function getStatusColorClass(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    awaiting_rider: 'bg-amber-100 text-amber-700',
    awaiting_funding: 'bg-amber-100 text-amber-700',
    funded: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-blue-100 text-blue-700',
    rider_marked_complete: 'bg-purple-100 text-purple-700',
    customer_marked_complete: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    disputed: 'bg-red-100 text-red-700',
    cancelled: 'bg-red-100 text-red-700',
    refunded: 'bg-gray-100 text-gray-700',
    
    // Escrow statuses
    not_created: 'bg-gray-100 text-gray-700',
    locked: 'bg-blue-100 text-blue-700',
    partially_released: 'bg-purple-100 text-purple-700',
    released: 'bg-green-100 text-green-700',
    under_review: 'bg-amber-100 text-amber-700',
    
    // Withdrawal statuses
    withdrawal_pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-blue-100 text-blue-700',
    processing: 'bg-purple-100 text-purple-700',
    paid: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    withdrawal_rejected: 'bg-red-100 text-red-700',
    
    // Verification statuses
    kyc_verified: 'bg-green-100 text-green-700',
    kyc_pending: 'bg-amber-100 text-amber-700',
    kyc_rejected: 'bg-red-100 text-red-700',
    suspended: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-700',
  };
  
  return colors[status] || 'bg-gray-100 text-gray-700';
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Generate OTP code
 */
export function generateOTP(length = 6): string {
  return Math.floor(Math.random() * Math.pow(10, length))
    .toString()
    .padStart(length, '0');
}

/**
 * Mask sensitive data
 */
export function maskString(str: string, visibleStart = 2, visibleEnd = 2): string {
  if (str.length <= visibleStart + visibleEnd) return str;
  
  const start = str.slice(0, visibleStart);
  const end = str.slice(-visibleEnd);
  const masked = '*'.repeat(str.length - visibleStart - visibleEnd);
  
  return start + masked + end;
}
