import type { BookingForecastPoint, CityRevenueTrendPoint } from '../types/index.js';
import { querySnowflake } from '../snowflake/client.js';

interface RawCityRevenueRow {
  CITY: string;
  BOOKING_MONTH: string;
  TOTAL_REVENUE: number;
}

const BASE_QUERY = `
  SELECT lm.CITY, b.BOOKING_MONTH, SUM(b.REVENUE) AS TOTAL_REVENUE
  FROM SALESFORCE_BOOKINGS b
  JOIN LOCATION_MASTER lm ON lm.LOCATION_ID = b.LOCATION_ID
  WHERE b.BOOKING_MONTH > DATEADD(month, -?, (SELECT MAX(BOOKING_MONTH) FROM SALESFORCE_BOOKINGS))
`;

/**
 * Month-over-month booking revenue by city, anchored on the latest BOOKING_MONTH in the table
 * rather than CURRENT_DATE() — this data is synthetic and doesn't track wall-clock time, so
 * anchoring on "today" can silently return a partial or empty window.
 */
export async function getRevenueTrendByCity(city?: string, months = 12): Promise<CityRevenueTrendPoint[]> {
  const sql = city
    ? `${BASE_QUERY} AND lm.CITY = ? GROUP BY lm.CITY, b.BOOKING_MONTH ORDER BY lm.CITY, b.BOOKING_MONTH`
    : `${BASE_QUERY} GROUP BY lm.CITY, b.BOOKING_MONTH ORDER BY lm.CITY, b.BOOKING_MONTH`;
  const binds = city ? [months, city] : [months];

  const rows = await querySnowflake<RawCityRevenueRow>(sql, binds);
  return rows.map((row) => ({
    city: row.CITY,
    month: row.BOOKING_MONTH,
    totalRevenue: Number(row.TOTAL_REVENUE),
  }));
}

interface RawBookingForecastRow {
  CITY: string;
  FORECAST_MONTH: string;
  PREDICTED_BOOKINGS: number;
  LOWER_BOUND: number;
  UPPER_BOUND: number;
  MONTHLY_CAPACITY: number;
}

/**
 * AI-forecasted booking volume by city and month (with confidence bounds), alongside each location's
 * MONTHLY_CAPACITY — use this to spot which locations are forecast to approach or exceed capacity.
 * FORECAST_BOOKINGS_RESULTS.CITY is a VARIANT holding a JSON-encoded string, hence the ::STRING cast.
 * The forecast horizon is short (~3 months) — don't imply a longer horizon exists.
 */
export async function getBookingForecast(city?: string): Promise<BookingForecastPoint[]> {
  const sql = `
    SELECT f.CITY::STRING AS CITY, f.FORECAST_MONTH, f.PREDICTED_BOOKINGS, f.LOWER_BOUND, f.UPPER_BOUND,
           lm.MONTHLY_CAPACITY
    FROM FORECAST_BOOKINGS_RESULTS f
    JOIN LOCATION_MASTER lm ON lm.CITY = f.CITY::STRING
    ${city ? 'WHERE f.CITY::STRING = ?' : ''}
    ORDER BY f.CITY::STRING, f.FORECAST_MONTH
  `;
  const binds = city ? [city] : [];

  const rows = await querySnowflake<RawBookingForecastRow>(sql, binds);
  return rows.map((row) => ({
    city: row.CITY,
    forecastMonth: row.FORECAST_MONTH,
    predictedBookings: Number(row.PREDICTED_BOOKINGS),
    lowerBound: Number(row.LOWER_BOUND),
    upperBound: Number(row.UPPER_BOUND),
    monthlyCapacity: Number(row.MONTHLY_CAPACITY),
  }));
}
