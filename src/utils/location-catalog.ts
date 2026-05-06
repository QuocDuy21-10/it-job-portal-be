export type LocationCatalogEntry = {
  aliases: string[];
  code: string;
  label: string;
};

type LocationSeed = {
  aliases?: string[];
  code: string;
  label: string;
};

type PlannedLocationBackfill =
  | {
      location: string;
      locationCode: string;
      matchedBy: string;
      status: 'resolved';
    }
  | {
      normalizedInput: string | null;
      status: 'unresolved';
    };

const LOCATION_SEEDS: LocationSeed[] = [
  { code: 'an-giang', label: 'An Giang' },
  { code: 'ba-ria-vung-tau', label: 'Bà Rịa - Vũng Tàu' },
  { code: 'bac-lieu', label: 'Bạc Liêu' },
  { code: 'bac-giang', label: 'Bắc Giang' },
  { code: 'bac-kan', label: 'Bắc Kạn' },
  { code: 'bac-ninh', label: 'Bắc Ninh' },
  { code: 'ben-tre', label: 'Bến Tre' },
  { code: 'binh-duong', label: 'Bình Dương' },
  { code: 'binh-dinh', label: 'Bình Định' },
  { code: 'binh-phuoc', label: 'Bình Phước' },
  { code: 'binh-thuan', label: 'Bình Thuận' },
  { code: 'ca-mau', label: 'Cà Mau' },
  { code: 'cao-bang', label: 'Cao Bằng' },
  { code: 'can-tho', label: 'Cần Thơ' },
  { code: 'da-nang', label: 'Đà Nẵng' },
  { code: 'dak-lak', label: 'Đắk Lắk' },
  { code: 'dak-nong', label: 'Đắk Nông' },
  { code: 'dien-bien', label: 'Điện Biên' },
  { code: 'dong-nai', label: 'Đồng Nai' },
  { code: 'dong-thap', label: 'Đồng Tháp' },
  { code: 'gia-lai', label: 'Gia Lai' },
  { code: 'ha-giang', label: 'Hà Giang' },
  { code: 'ha-nam', label: 'Hà Nam' },
  { aliases: ['Hanoi'], code: 'ha-noi', label: 'Hà Nội' },
  { code: 'ha-tinh', label: 'Hà Tĩnh' },
  { code: 'hai-duong', label: 'Hải Dương' },
  { code: 'hai-phong', label: 'Hải Phòng' },
  { code: 'hau-giang', label: 'Hậu Giang' },
  { code: 'hoa-binh', label: 'Hòa Bình' },
  { code: 'hung-yen', label: 'Hưng Yên' },
  { code: 'khanh-hoa', label: 'Khánh Hòa' },
  { code: 'kien-giang', label: 'Kiên Giang' },
  { code: 'kon-tum', label: 'Kon Tum' },
  { code: 'lai-chau', label: 'Lai Châu' },
  { code: 'lang-son', label: 'Lạng Sơn' },
  { code: 'lao-cai', label: 'Lào Cai' },
  { code: 'lam-dong', label: 'Lâm Đồng' },
  { code: 'long-an', label: 'Long An' },
  { code: 'nam-dinh', label: 'Nam Định' },
  { code: 'nghe-an', label: 'Nghệ An' },
  { code: 'ninh-binh', label: 'Ninh Bình' },
  { code: 'ninh-thuan', label: 'Ninh Thuận' },
  { code: 'phu-tho', label: 'Phú Thọ' },
  { code: 'phu-yen', label: 'Phú Yên' },
  { code: 'quang-binh', label: 'Quảng Bình' },
  { code: 'quang-nam', label: 'Quảng Nam' },
  { code: 'quang-ngai', label: 'Quảng Ngãi' },
  { code: 'quang-ninh', label: 'Quảng Ninh' },
  { code: 'quang-tri', label: 'Quảng Trị' },
  {
    aliases: ['HCM', 'HCMC', 'Ho Chi Minh', 'Ho Chi Minh City', 'Sai Gon', 'Sài Gòn', 'Thanh Pho Ho Chi Minh', 'TP HCM', 'TPHCM'],
    code: 'ho-chi-minh',
    label: 'TP. Hồ Chí Minh',
  },
  { code: 'soc-trang', label: 'Sóc Trăng' },
  { code: 'son-la', label: 'Sơn La' },
  { code: 'tay-ninh', label: 'Tây Ninh' },
  { code: 'thai-binh', label: 'Thái Bình' },
  { code: 'thai-nguyen', label: 'Thái Nguyên' },
  { code: 'thanh-hoa', label: 'Thanh Hóa' },
  { aliases: ['Hue'], code: 'thua-thien-hue', label: 'Thừa Thiên - Huế' },
  { code: 'tien-giang', label: 'Tiền Giang' },
  { code: 'tra-vinh', label: 'Trà Vinh' },
  { code: 'tuyen-quang', label: 'Tuyên Quang' },
  { code: 'vinh-long', label: 'Vĩnh Long' },
  { code: 'vinh-phuc', label: 'Vĩnh Phúc' },
  { code: 'yen-bai', label: 'Yên Bái' },
  { aliases: ['Work From Home', 'WFH'], code: 'remote', label: 'Remote' },
];

const normalizeLocationLookupValue = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const maybeUnwrapRegexPattern = (value: string) => {
  const match = value.match(/^\/(.+)\/[a-z]*$/i);
  return match?.[1] ?? value;
};

const createAliasSet = (seed: LocationSeed) => {
  return Array.from(
    new Set(
      [
        seed.label,
        seed.code,
        seed.code.replace(/-/g, ' '),
        seed.label.replace(/^TP\.\s*/i, ''),
        seed.label.replace(/^Thành phố\s+/i, ''),
        ...(seed.aliases ?? []),
      ].filter(Boolean),
    ),
  );
};

export const LOCATION_CATALOG: LocationCatalogEntry[] = LOCATION_SEEDS.map(seed => ({
  aliases: createAliasSet(seed),
  code: seed.code,
  label: seed.label,
}));

const LOCATION_BY_CODE = new Map(LOCATION_CATALOG.map(entry => [entry.code, entry]));

const LOCATION_LOOKUP = new Map<string, LocationCatalogEntry>();

for (const entry of LOCATION_CATALOG) {
  for (const alias of entry.aliases) {
    const normalizedAlias = normalizeLocationLookupValue(alias);

    if (!normalizedAlias) {
      continue;
    }

    LOCATION_LOOKUP.set(normalizedAlias, entry);
    LOCATION_LOOKUP.set(normalizedAlias.replace(/\s+/g, ''), entry);
  }
}

export const getLocationByCode = (code?: string | null) => {
  if (!code) {
    return null;
  }

  return LOCATION_BY_CODE.get(code.trim().toLowerCase()) ?? null;
};

export const normalizeLocationInput = (value?: string | RegExp | null) => {
  if (value instanceof RegExp) {
    return normalizeLocationLookupValue(value.source);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const unwrapped = maybeUnwrapRegexPattern(value);
  return normalizeLocationLookupValue(unwrapped);
};

export const resolveLocationFromInput = (value?: string | RegExp | null) => {
  const normalizedValue = normalizeLocationInput(value);

  if (!normalizedValue) {
    return null;
  }

  return (
    LOCATION_LOOKUP.get(normalizedValue) ??
    LOCATION_LOOKUP.get(normalizedValue.replace(/\s+/g, '')) ??
    null
  );
};

export const resolveLocationPayload = (payload: {
  location?: string | null;
  locationCode?: string | null;
}) => {
  const locationByCode = getLocationByCode(payload.locationCode);

  if (locationByCode) {
    return {
      location: locationByCode.label,
      locationCode: locationByCode.code,
      matchedBy: 'locationCode',
    };
  }

  const locationByText = resolveLocationFromInput(payload.location);

  if (locationByText) {
    return {
      location: locationByText.label,
      locationCode: locationByText.code,
      matchedBy: 'location',
    };
  }

  return null;
};

export const planLocationBackfill = (
  locationCode?: string | null,
  location?: string | null,
): PlannedLocationBackfill => {
  const resolvedLocation = resolveLocationPayload({ location, locationCode });

  if (resolvedLocation) {
    return {
      location: resolvedLocation.location,
      locationCode: resolvedLocation.locationCode,
      matchedBy: resolvedLocation.matchedBy,
      status: 'resolved',
    };
  }

  return {
    normalizedInput: normalizeLocationInput(locationCode ?? location ?? null),
    status: 'unresolved',
  };
};
