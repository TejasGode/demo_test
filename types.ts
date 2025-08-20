export enum InvoiceStatus {
  Paid = 'Paid',
  Overdue = 'Overdue',
  DueSoon = 'Due Soon',
  Pending = 'Pending',
}

export interface Invoice {
  id: string;
  customerName: string;
  customerContact: {
    email: string;
    phone: string;
    whatsapp?: string;
  };
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  outstanding: number;
  status: InvoiceStatus;
  daysOverdue: number;
  lastReminderSent: string | null;
}

export type ReminderType = 'email' | 'sms' | 'whatsapp';

export interface TallyConnection {
  server: string;
  port: string;
  company?: string;
}

export interface EmailSettings {
    enabled: boolean;
    smtpHost: string;
    smtpPort: string;
    username: string;
    password?: string;
    fromName: string;
    fromEmail: string;
}

export interface SmsSettings {
    enabled: boolean;
    provider: 'twilio';
    accountSid: string;
    authToken?: string;
    fromNumber: string;
}

export interface WhatsAppSettings {
    enabled: boolean;
    provider: 'twilio';
    accountSid: string;
    authToken?: string;
    fromNumber: string;
}

export interface AppSettings {
    tally: TallyConnection & { lastSync: string | null; autoSync: boolean; syncInterval: number };
    email: EmailSettings;
    sms: SmsSettings;
    whatsapp: WhatsAppSettings;
}

export type View = 'dashboard' | 'settings';
