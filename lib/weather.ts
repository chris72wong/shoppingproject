import { z } from "zod";
import type { WeatherContext } from "./types";

const number = z.number().finite();
const forecastSchema = z.object({
  current: z.object({ time: z.string(), temperature_2m: number, apparent_temperature: number, precipitation: number, wind_speed_10m: number }),
  daily: z.object({ temperature_2m_min: z.array(number).min(1), temperature_2m_max: z.array(number).min(1), precipitation_probability_max: z.array(number).min(1) }),
});

export async function fetchWeather(city: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<WeatherContext> {
  const options = { cache: "no-store" as const, signal: AbortSignal.any([AbortSignal.timeout(7000), ...(signal ? [signal] : [])]) };
  const search = new URL("https://geocoding-api.open-meteo.com/v1/search");
  search.searchParams.set("name", city);
  search.searchParams.set("count", "1");
  const geo = await fetcher(search, options);
  if (!geo.ok) throw new Error("Weather location search is unavailable.");
  const data = z.object({ results: z.array(z.object({ name: z.string(), admin1: z.string().optional(), country: z.string().optional(), latitude: number, longitude: number })).optional() }).parse(await geo.json());
  const place = data.results?.[0];
  if (!place) throw new Error("City not found. Try a nearby city name.");
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  Object.entries({ latitude: String(place.latitude), longitude: String(place.longitude), current: "temperature_2m,apparent_temperature,precipitation,wind_speed_10m", daily: "temperature_2m_min,temperature_2m_max,precipitation_probability_max", timezone: "auto", forecast_days: "1", temperature_unit: "celsius", wind_speed_unit: "kmh", precipitation_unit: "mm" }).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetcher(url, options);
  if (!response.ok) throw new Error("Weather forecast is unavailable.");
  const { current: c, daily: d } = forecastSchema.parse(await response.json());
  return { location: [place.name, place.admin1, place.country].filter(Boolean).join(", "), observedAt: c.time, temperature: c.temperature_2m, feelsLike: c.apparent_temperature, precipitation: c.precipitation, wind: c.wind_speed_10m, low: d.temperature_2m_min[0], high: d.temperature_2m_max[0], rainChance: d.precipitation_probability_max[0] };
}
