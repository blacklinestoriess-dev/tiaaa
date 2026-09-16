/**
 * server/weatherService.ts
 * Reliable, zero-configuration server-side live weather fetching tool for Tia using Open-Meteo.
 *
 * Requirements:
 * - Completely keyless / zero-configuration: requires NO API key or secret.
 * - Uses Open-Meteo Geocoding API to resolve city names into latitude & longitude.
 * - Uses Open-Meteo Current Weather Forecast API to retrieve:
 *   - current temperature
 *   - apparent / feels-like temperature
 *   - weather condition (via WMO weather interpretation)
 *   - humidity (%)
 *   - wind speed (km/h)
 *   - precipitation / rain information (mm & isRaining indicator)
 * - Server-side only execution (never exposed to client browser).
 * - Transient data handling: results are returned directly to the conversational agent without permanent storage.
 */

export interface LiveWeatherData {
  success: boolean;
  city: string;
  location: string;
  region?: string;
  country?: string;
  temperature?: number;
  temperatureFormatted?: string;
  feelsLike?: number;
  feelsLikeFormatted?: string;
  condition?: string;
  humidity?: number;
  humidityFormatted?: string;
  windSpeed?: number;
  windSpeedFormatted?: string;
  precipitation?: number;
  precipitationFormatted?: string;
  rain?: number;
  rainFormatted?: string;
  isRaining?: boolean;
  provider?: string;
  error?: string;
  message?: string;
}

// Well-known Indian city name variants & aliases for accurate geocoding
const INDIAN_CITY_ALIASES: Record<string, string> = {
  bangalore: 'Bengaluru',
  bengaluru: 'Bengaluru',
  bombay: 'Mumbai',
  mumbai: 'Mumbai',
  calcutta: 'Kolkata',
  kolkata: 'Kolkata',
  madras: 'Chennai',
  chennai: 'Chennai',
  poona: 'Pune',
  pune: 'Pune',
  banaras: 'Varanasi',
  benaras: 'Varanasi',
  kashi: 'Varanasi',
  varanasi: 'Varanasi',
  gurgaon: 'Gurugram',
  gurugram: 'Gurugram',
  baroda: 'Vadodara',
  vadodara: 'Vadodara',
  trivandrum: 'Thiruvananthapuram',
  thiruvananthapuram: 'Thiruvananthapuram',
  cochin: 'Kochi',
  kochi: 'Kochi',
  allahabad: 'Prayagraj',
  prayagraj: 'Prayagraj',
  pondicherry: 'Puducherry',
  puducherry: 'Puducherry',
  patna: 'Patna',
  delhi: 'Delhi',
  'new delhi': 'New Delhi',
  noida: 'Noida',
  hyderabad: 'Hyderabad',
  ahmedabad: 'Ahmedabad',
  jaipur: 'Jaipur',
  lucknow: 'Lucknow',
  chandigarh: 'Chandigarh',
  bhopal: 'Bhopal',
  indore: 'Indore',
  ranchi: 'Ranchi',
  guwahati: 'Guwahati',
  bhubaneswar: 'Bhubaneswar',
  dehradun: 'Dehradun',
  shimla: 'Shimla',
  srinagar: 'Srinagar',
  goa: 'Goa',
  surat: 'Surat',
  nagpur: 'Nagpur',
  visakhapatnam: 'Visakhapatnam',
};

// Map WMO weather codes to human descriptions
function getWmoWeatherCondition(code: number): { condition: string; isRaining: boolean } {
  switch (code) {
    case 0:
      return { condition: 'Clear sky', isRaining: false };
    case 1:
      return { condition: 'Mainly clear', isRaining: false };
    case 2:
      return { condition: 'Partly cloudy', isRaining: false };
    case 3:
      return { condition: 'Overcast and cloudy', isRaining: false };
    case 45:
    case 48:
      return { condition: 'Foggy with reduced visibility', isRaining: false };
    case 51:
      return { condition: 'Light drizzle', isRaining: true };
    case 53:
      return { condition: 'Moderate drizzle', isRaining: true };
    case 55:
      return { condition: 'Dense drizzle', isRaining: true };
    case 56:
    case 57:
      return { condition: 'Freezing drizzle', isRaining: true };
    case 61:
      return { condition: 'Slight rain', isRaining: true };
    case 63:
      return { condition: 'Moderate rain', isRaining: true };
    case 65:
      return { condition: 'Heavy rain', isRaining: true };
    case 66:
    case 67:
      return { condition: 'Freezing rain', isRaining: true };
    case 71:
      return { condition: 'Slight snowfall', isRaining: false };
    case 73:
      return { condition: 'Moderate snowfall', isRaining: false };
    case 75:
      return { condition: 'Heavy snowfall', isRaining: false };
    case 77:
      return { condition: 'Snow grains', isRaining: false };
    case 80:
      return { condition: 'Slight rain showers', isRaining: true };
    case 81:
      return { condition: 'Moderate rain showers', isRaining: true };
    case 82:
      return { condition: 'Violent rain showers', isRaining: true };
    case 85:
    case 86:
      return { condition: 'Snow showers', isRaining: false };
    case 95:
      return { condition: 'Thunderstorm', isRaining: true };
    case 96:
    case 99:
      return { condition: 'Thunderstorm with hail', isRaining: true };
    default:
      return { condition: 'Pleasant weather', isRaining: false };
  }
}

/**
 * Clean up user-provided location string
 */
export function sanitizeLocationQuery(rawQuery: string): string {
  if (!rawQuery) return '';
  let query = rawQuery
    .trim()
    .replace(/^in\s+/i, '')
    .replace(/^of\s+/i, '')
    .replace(/^at\s+/i, '')
    .replace(/^for\s+/i, '')
    .replace(/\s+(city|town|state|district|area)$/i, '')
    .replace(/[?,.!\*]+$/, '')
    .trim();

  const lower = query.toLowerCase();
  if (INDIAN_CITY_ALIASES[lower]) {
    return INDIAN_CITY_ALIASES[lower];
  }
  return query;
}

/**
 * Fetch live weather data using Open-Meteo (zero-config, completely free, reliable)
 */
async function fetchFromOpenMeteo(cleanLocation: string): Promise<LiveWeatherData | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    // 1. Geocode location name to lat/lon
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      cleanLocation
    )}&count=5&language=en&format=json`;

    const geoRes = await fetch(geoUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TiaAI-VoiceAssistant/1.0' },
    });

    if (!geoRes.ok) {
      return null;
    }

    const geoData: any = await geoRes.json();
    if (!geoData.results || !Array.isArray(geoData.results) || geoData.results.length === 0) {
      return null;
    }

    // Prioritize results from India if applicable, or highest population
    const results = geoData.results;
    let chosen = results[0];
    const indianResult = results.find((r: any) => r.country_code === 'IN');
    if (indianResult) {
      chosen = indianResult;
    } else {
      // Sort by population descending
      results.sort((a: any, b: any) => (b.population || 0) - (a.population || 0));
      chosen = results[0];
    }

    const lat = chosen.latitude;
    const lon = chosen.longitude;
    const cityName = chosen.name || cleanLocation;
    const regionName = chosen.admin1 || '';
    const countryName = chosen.country || '';
    const locationDisplay = [cityName, regionName, countryName].filter(Boolean).join(', ');

    // 2. Fetch current weather forecast metrics
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m&timezone=auto`;

    const weatherRes = await fetch(weatherUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TiaAI-VoiceAssistant/1.0' },
    });

    if (!weatherRes.ok) {
      return null;
    }

    const weatherData: any = await weatherRes.json();
    const current = weatherData.current;
    if (!current) {
      return null;
    }

    const temp = Math.round(current.temperature_2m * 10) / 10;
    const feelsLike = Math.round(current.apparent_temperature * 10) / 10;
    const humidity = Math.round(current.relative_humidity_2m);
    const windSpeed = Math.round(current.wind_speed_10m * 10) / 10;
    const precipitation = Math.round((current.precipitation || 0) * 10) / 10;
    const rain = Math.round((current.rain || 0) * 10) / 10;
    const weatherCode = current.weather_code ?? 0;

    const { condition, isRaining: codeIsRaining } = getWmoWeatherCondition(weatherCode);
    const isRaining = rain > 0 || precipitation > 0 || codeIsRaining;

    return {
      success: true,
      city: cityName,
      location: locationDisplay,
      region: regionName,
      country: countryName,
      temperature: temp,
      temperatureFormatted: `${temp}°C`,
      feelsLike: feelsLike,
      feelsLikeFormatted: `${feelsLike}°C`,
      condition,
      humidity,
      humidityFormatted: `${humidity}%`,
      windSpeed,
      windSpeedFormatted: `${windSpeed} km/h`,
      precipitation,
      precipitationFormatted: `${precipitation} mm`,
      rain,
      rainFormatted: `${rain} mm`,
      isRaining,
      provider: 'Open-Meteo Live API',
    };
  } catch (err: any) {
    console.warn(`[WeatherService] Open-Meteo query failed for "${cleanLocation}":`, err?.message || err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Primary server-side Live Weather Tool function (Zero-Configuration via Open-Meteo)
 */
export async function getLiveWeather(locationQuery: string): Promise<LiveWeatherData> {
  const clean = sanitizeLocationQuery(locationQuery);

  if (!clean || clean.length < 2) {
    return {
      success: false,
      city: '',
      location: '',
      error: 'location_required',
      message: "Which city's weather should I check?",
    };
  }

  // Directly fetch real-time live weather via Open-Meteo (zero keys, zero configuration required)
  try {
    const openMeteoData = await fetchFromOpenMeteo(clean);
    if (openMeteoData && openMeteoData.success) {
      return openMeteoData;
    }
  } catch (err: any) {
    console.warn('[WeatherService] Error retrieving weather from Open-Meteo:', err?.message || err);
  }

  // Graceful failure if location not found or service down
  return {
    success: false,
    city: clean,
    location: clean,
    error: 'unavailable',
    message: `Live weather information for ${clean} is temporarily unavailable right now.`,
  };
}
