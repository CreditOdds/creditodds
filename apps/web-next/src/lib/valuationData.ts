import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface ValuationDataPoint {
  year: number;
  source: string;
  cpp: number;
  url?: string;
}

export interface ValuationFile {
  slug: string;
  program: string;
  unit: 'mile' | 'point';
  data_points: ValuationDataPoint[];
}

const VALUATIONS_DIR = path.join(process.cwd(), '..', '..', 'data', 'valuations');

export function loadValuation(slug: string): ValuationFile | null {
  const filePath = path.join(VALUATIONS_DIR, `${slug}.yaml`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw) as ValuationFile;
  return parsed;
}
