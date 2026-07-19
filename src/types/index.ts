export interface Account {
  id: string;
  name: string;
  industry: string;
  tier: 'Starter' | 'Growth' | 'Enterprise';
  arr: number;
  renewalDate: string;
  owner: string;
}

export interface Contact {
  id: string;
  accountId: string;
  name: string;
  title: string;
  email: string;
  isChampion: boolean;
}

export type DealStage = 'Prospecting' | 'Qualification' | 'Proposal' | 'Negotiation' | 'Closed Won' | 'Closed Lost';

export interface Deal {
  id: string;
  accountId: string;
  name: string;
  stage: DealStage;
  amount: number;
  closeDate: string;
  probability: number;
}

export interface Activity {
  id: string;
  accountId: string;
  type: 'call' | 'email' | 'meeting' | 'note';
  summary: string;
  date: string;
  actor: string;
}

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Ticket {
  id: string;
  accountId: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdDate: string;
  updatedDate: string;
}

export interface UsageTrendPoint {
  month: string;
  score: number;
}

export interface ProductUsage {
  accountId: string;
  activeSeats: number;
  licensedSeats: number;
  weeklyActiveUsers: number;
  lastLoginDate: string;
  usageTrend: UsageTrendPoint[];
}

export interface FeatureAdoption {
  accountId: string;
  feature: string;
  adopted: boolean;
  adoptionDate: string | null;
  usageLevel: 'none' | 'low' | 'medium' | 'high';
}
