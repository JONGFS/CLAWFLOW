const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface NormalizedListing {
  id: string;
  title: string;
  price: number;
  beds: number;
  baths: number;
  neighborhood: string;
  amenities: string[];
  persona: string | null;
  leasing_special: string | null;
  photo_count: number;
  photos: { id: string; filename: string; label: string; url: string }[];
  missing_fields: string[];
  created_at: string;
}

export async function submitListing(fields: {
  title: string;
  price: number;
  beds: number;
  baths: number;
  neighborhood: string;
  squareFootage?: number;
  amenities: string[];
  persona?: string;
  leasingSpecial?: string;
  photos: File[];
}): Promise<NormalizedListing> {
  const form = new FormData();
  form.append('title', fields.title);
  form.append('price', String(fields.price));
  form.append('beds', String(fields.beds));
  form.append('baths', String(fields.baths));
  form.append('neighborhood', fields.neighborhood);
  if (fields.squareFootage) form.append('square_footage', String(fields.squareFootage));
  form.append('amenities', JSON.stringify(fields.amenities));
  if (fields.persona) form.append('persona', fields.persona);
  if (fields.leasingSpecial) form.append('leasing_special', fields.leasingSpecial);
  for (const file of fields.photos) {
    form.append('photos', file);
  }

  const res = await fetch(`${API_URL}/api/listings`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `Server error (${res.status})`);
  }

  return res.json();
}
