export interface Customer {
  customerId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  homeLocationId: number;
  joinDate: string;
  lastVisitDate: string;
  totalVisits: number;
  lifetimeSpend: number;
  avgSpendPerVisit: number;
  preferredService: string;
  membershipType: string;
  referralSource: string;
  npsScore: number;
  daysSinceLastVisit: number;
  visitFrequencyMonthly: number;
  address: string;
  isActive: boolean;
}

export type RenewalLikelihood = 'At Risk' | 'Moderate' | 'Unlikely' | 'Very Likely';

export interface Renewal {
  renewalId: number;
  customerId: number;
  currentTier: string;
  homeLocationId: number;
  renewalDate: string;
  totalVisits: number;
  visitFrequencyMonthly: number;
  daysSinceLastVisit: number;
  npsScore: number;
  lifetimeSpend: number;
  renewalProbabilityPct: number;
  renewalLikelihood: RenewalLikelihood;
  upgradeCandidate: boolean;
}

export interface UpgradeOffer {
  customerId: number;
  firstName: string;
  lastName: string;
  currentTier: string;
  recommendedTier: string;
  visitFrequencyMonthly: number;
  lifetimeSpend: number;
  preferredService: string;
  renewalDate: string;
  aiUpgradePitch: string;
}

export type MembershipEventType = 'Signup' | 'Upgrade' | 'Downgrade' | 'Renewal' | 'Cancellation';

export interface MembershipEvent {
  eventId: number;
  customerId: number;
  eventDate: string;
  eventType: MembershipEventType;
  fromTier: string | null;
  toTier: string | null;
  triggerSource: string | null;
  campaignId: number | null;
}

export type AiTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
export type ChurnRisk = 'High' | 'Medium' | 'Low';

export interface CustomerHealth {
  customerId: number;
  firstName: string;
  lastName: string;
  homeLocationId: number;
  lifetimeSpend: number;
  totalVisits: number;
  visitFrequencyMonthly: number;
  daysSinceLastVisit: number;
  npsScore: number;
  membershipType: string;
  preferredService: string;
  aiTier: AiTier;
  churnRisk: ChurnRisk;
  churnProbabilityPct: number;
  predictedLtv12M: number;
  aiRecommendation: string;
}

export interface CityRevenueTrendPoint {
  city: string;
  month: string;
  totalRevenue: number;
}

export interface LocationPnL {
  city: string;
  month: string;
  revenue: number;
  laborCost: number;
  operationalCost: number;
  totalCost: number;
  profit: number;
  marginPct: number;
}

export interface RefundBreakdown {
  city: string;
  serviceType: string | null;
  bookingCount: number;
  refundCount: number;
  refundAmount: number;
  revenue: number;
  refundRatePct: number;
}

export interface RevenuePerRoom {
  city: string;
  avgMonthlyRevenue: number;
  treatmentRooms: number;
  avgMonthlyRevenuePerRoom: number;
}

export interface LaborCostByRole {
  city: string;
  role: string;
  headcount: number;
  totalLaborCost: number;
  overtimeCost: number;
  costPerEmployee: number;
}

export interface BookingDemandPoint {
  city: string;
  month: string;
  bookingCount: number;
  therapistHoursRequired: number;
}

export interface StaffingSummary {
  city: string;
  activeHeadcount: number;
  therapistHeadcount: number;
  openRequisitions: number;
  headcountRequested: number;
  recruitingSpendLast6Months: number;
}

export interface TenureAndTurnover {
  city: string;
  role: string | null;
  headcount: number;
  avgTenureMonths: number;
  terminatedCount: number;
  turnoverRatePct: number;
  avgCompensationAnnual: number;
}

export interface RetentionRiskForecast {
  city: string;
  forecastMonth: string;
  predictedTerminations: number;
  worstCaseTerminations: number;
}

export interface CampaignPerformance {
  channel: string;
  totalBudget: number;
  totalConverted: number;
  totalRevenueAttributed: number;
  costPerAcquisition: number | null;
}

export interface RevenueByServiceType {
  city: string;
  serviceType: string;
  bookingCount: number;
  revenue: number;
}

export interface OperationalCostBreakdown {
  city: string;
  costCategory: string;
  amount: number;
}

export type ChurnCohortGroupBy = 'tier' | 'churnRisk';

export interface ChurnCohortSummary {
  groupValue: string;
  customerCount: number;
  avgLtv: number;
  avgChurnProbabilityPct: number;
  avgVisitFrequencyMonthly: number;
  avgDaysSinceLastVisit: number;
  avgNpsScore: number;
}

export interface ChurnByLocation {
  city: string;
  customerCount: number;
  avgChurnProbabilityPct: number;
  highChurnRiskCount: number;
  highChurnRiskPct: number;
}

export interface CampaignRetentionImpact {
  campaignName: string;
  respondedCustomerCount: number;
  atRiskOrUnlikelyRenewalCount: number;
  atRiskOrUnlikelyRenewalPct: number;
  avgChurnProbabilityPct: number;
}

export interface RecruitingPipelineStats {
  city: string;
  role: string;
  openCount: number;
  filledCount: number;
  avgDaysToFill: number | null;
  avgDaysOpenForStillOpen: number | null;
}

export interface BookingForecastPoint {
  city: string;
  forecastMonth: string;
  predictedBookings: number;
  lowerBound: number;
  upperBound: number;
  monthlyCapacity: number;
}

export interface WorkforceAnalystAnswer {
  /** Cortex Analyst's restatement of the question it answered. */
  interpretation: string;
  /** The SQL Cortex Analyst generated, or null if it didn't produce one (e.g. needs clarification). */
  generatedSql: string | null;
  /** Real result rows from executing generatedSql, or null if there was no query to run. */
  rows: Record<string, unknown>[] | null;
}
