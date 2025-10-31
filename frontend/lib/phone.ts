/**
 * Phone number utilities with country flag support
 */

export interface PhoneInfo {
  phone: string;
  countryCode: string; // ISO2 code (e.g., 'us', 'co')
  formatted: string; // Formatted display (e.g., '+1 234 567 8900')
}

/**
 * Map of country dial codes to ISO2 codes
 */
const DIAL_CODE_TO_ISO2: Record<string, string> = {
  '1': 'us', // US/Canada (default to US)
  '44': 'gb', // UK
  '49': 'de', // Germany
  '33': 'fr', // France
  '39': 'it', // Italy
  '34': 'es', // Spain
  '52': 'mx', // Mexico
  '54': 'ar', // Argentina
  '55': 'br', // Brazil
  '56': 'cl', // Chile
  '57': 'co', // Colombia
  '58': 've', // Venezuela
  '60': 'my', // Malaysia
  '61': 'au', // Australia
  '62': 'id', // Indonesia
  '63': 'ph', // Philippines
  '64': 'nz', // New Zealand
  '65': 'sg', // Singapore
  '66': 'th', // Thailand
  '81': 'jp', // Japan
  '82': 'kr', // South Korea
  '84': 'vn', // Vietnam
  '86': 'cn', // China
  '90': 'tr', // Turkey
  '91': 'in', // India
  '92': 'pk', // Pakistan
  '93': 'af', // Afghanistan
  '94': 'lk', // Sri Lanka
  '95': 'mm', // Myanmar
  '98': 'ir', // Iran
  '212': 'ma', // Morocco
  '213': 'dz', // Algeria
  '216': 'tn', // Tunisia
  '218': 'ly', // Libya
  '220': 'gm', // Gambia
  '221': 'sn', // Senegal
  '222': 'mr', // Mauritania
  '223': 'ml', // Mali
  '224': 'gn', // Guinea
  '225': 'ci', // Ivory Coast
  '226': 'bf', // Burkina Faso
  '227': 'ne', // Niger
  '228': 'tg', // Togo
  '229': 'bj', // Benin
  '230': 'mu', // Mauritius
  '231': 'lr', // Liberia
  '232': 'sl', // Sierra Leone
  '233': 'gh', // Ghana
  '234': 'ng', // Nigeria
  '235': 'td', // Chad
  '236': 'cf', // Central African Republic
  '237': 'cm', // Cameroon
  '238': 'cv', // Cape Verde
  '239': 'st', // São Tomé and Príncipe
  '240': 'gq', // Equatorial Guinea
  '241': 'ga', // Gabon
  '242': 'cg', // Congo
  '243': 'cd', // Democratic Republic of the Congo
  '244': 'ao', // Angola
  '245': 'gw', // Guinea-Bissau
  '246': 'io', // British Indian Ocean Territory
  '248': 'sc', // Seychelles
  '249': 'sd', // Sudan
  '250': 'rw', // Rwanda
  '251': 'et', // Ethiopia
  '252': 'so', // Somalia
  '253': 'dj', // Djibouti
  '254': 'ke', // Kenya
  '255': 'tz', // Tanzania
  '256': 'ug', // Uganda
  '257': 'bi', // Burundi
  '258': 'mz', // Mozambique
  '260': 'zm', // Zambia
  '261': 'mg', // Madagascar
  '262': 're', // Réunion
  '263': 'zw', // Zimbabwe
  '264': 'na', // Namibia
  '265': 'mw', // Malawi
  '266': 'ls', // Lesotho
  '267': 'bw', // Botswana
  '268': 'sz', // Swaziland
  '269': 'km', // Comoros
  '290': 'sh', // Saint Helena
  '291': 'er', // Eritrea
  '297': 'aw', // Aruba
  '298': 'fo', // Faroe Islands
  '299': 'gl', // Greenland
  '350': 'gi', // Gibraltar
  '351': 'pt', // Portugal
  '352': 'lu', // Luxembourg
  '353': 'ie', // Ireland
  '354': 'is', // Iceland
  '355': 'al', // Albania
  '356': 'mt', // Malta
  '357': 'cy', // Cyprus
  '358': 'fi', // Finland
  '359': 'bg', // Bulgaria
  '370': 'lt', // Lithuania
  '371': 'lv', // Latvia
  '372': 'ee', // Estonia
  '373': 'md', // Moldova
  '374': 'am', // Armenia
  '375': 'by', // Belarus
  '376': 'ad', // Andorra
  '377': 'mc', // Monaco
  '378': 'sm', // San Marino
  '380': 'ua', // Ukraine
  '381': 'rs', // Serbia
  '382': 'me', // Montenegro
  '383': 'xk', // Kosovo
  '385': 'hr', // Croatia
  '386': 'si', // Slovenia
  '387': 'ba', // Bosnia and Herzegovina
  '389': 'mk', // North Macedonia
  '420': 'cz', // Czech Republic
  '421': 'sk', // Slovakia
  '423': 'li', // Liechtenstein
  '500': 'fk', // Falkland Islands
  '501': 'bz', // Belize
  '502': 'gt', // Guatemala
  '503': 'sv', // El Salvador
  '504': 'hn', // Honduras
  '505': 'ni', // Nicaragua
  '506': 'cr', // Costa Rica
  '507': 'pa', // Panama
  '508': 'pm', // Saint Pierre and Miquelon
  '509': 'ht', // Haiti
  '590': 'gp', // Guadeloupe
  '591': 'bo', // Bolivia
  '592': 'gy', // Guyana
  '593': 'ec', // Ecuador
  '594': 'gf', // French Guiana
  '595': 'py', // Paraguay
  '596': 'mq', // Martinique
  '597': 'sr', // Suriname
  '598': 'uy', // Uruguay
  '599': 'an', // Netherlands Antilles
  '670': 'tl', // East Timor
  '672': 'nf', // Norfolk Island
  '673': 'bn', // Brunei
  '674': 'nr', // Nauru
  '675': 'pg', // Papua New Guinea
  '676': 'to', // Tonga
  '677': 'sb', // Solomon Islands
  '678': 'vu', // Vanuatu
  '679': 'fj', // Fiji
  '680': 'pw', // Palau
  '681': 'wf', // Wallis and Futuna
  '682': 'ck', // Cook Islands
  '683': 'nu', // Niue
  '685': 'ws', // Samoa
  '686': 'ki', // Kiribati
  '687': 'nc', // New Caledonia
  '688': 'tv', // Tuvalu
  '689': 'pf', // French Polynesia
  '690': 'tk', // Tokelau
  '691': 'fm', // Micronesia
  '692': 'mh', // Marshall Islands
  '850': 'kp', // North Korea
  '852': 'hk', // Hong Kong
  '853': 'mo', // Macau
  '855': 'kh', // Cambodia
  '856': 'la', // Laos
  '880': 'bd', // Bangladesh
  '886': 'tw', // Taiwan
  '960': 'mv', // Maldives
  '961': 'lb', // Lebanon
  '962': 'jo', // Jordan
  '963': 'sy', // Syria
  '964': 'iq', // Iraq
  '965': 'kw', // Kuwait
  '966': 'sa', // Saudi Arabia
  '967': 'ye', // Yemen
  '968': 'om', // Oman
  '970': 'ps', // Palestine
  '971': 'ae', // United Arab Emirates
  '972': 'il', // Israel
  '973': 'bh', // Bahrain
  '974': 'qa', // Qatar
  '975': 'bt', // Bhutan
  '976': 'mn', // Mongolia
  '977': 'np', // Nepal
  '992': 'tj', // Tajikistan
  '993': 'tm', // Turkmenistan
  '994': 'az', // Azerbaijan
  '995': 'ge', // Georgia
  '996': 'kg', // Kyrgyzstan
  '998': 'uz', // Uzbekistan
};

/**
 * Parse phone number and extract country information
 */
export function parsePhone(phoneNumber: string): PhoneInfo | null {
  try {
    if (!phoneNumber || !phoneNumber.startsWith('+')) {
      return null;
    }

    // Extract dial code (try longest first: +1234, +123, +12, +1)
    let dialCode = '';
    let iso2 = '';

    for (let len = 4; len >= 1; len--) {
      const testCode = phoneNumber.substring(1, 1 + len);
      if (DIAL_CODE_TO_ISO2[testCode]) {
        dialCode = testCode;
        iso2 = DIAL_CODE_TO_ISO2[testCode];
        break;
      }
    }

    if (!iso2) {
      return null;
    }

    return {
      phone: phoneNumber,
      countryCode: iso2,
      formatted: formatPhoneSimple(phoneNumber, dialCode),
    };
  } catch (error) {
    console.error('Error parsing phone:', error);
    return null;
  }
}

/**
 * Simple phone formatting
 */
function formatPhoneSimple(phone: string, dialCode: string): string {
  // Remove dial code and format the rest
  const numberPart = phone.substring(dialCode.length + 1); // +1 from the "+"

  // Add space after country code
  return `+${dialCode} ${numberPart}`;
}

/**
 * Format phone number for display (short version)
 * Returns: "+57 311..." or full if short
 */
export function formatPhoneShort(phoneNumber: string, maxLength = 15): string {
  const parsed = parsePhone(phoneNumber);

  if (!parsed) {
    // Fallback to simple truncation
    return phoneNumber.length > maxLength
      ? phoneNumber.substring(0, maxLength - 3) + '...'
      : phoneNumber;
  }

  const formatted = parsed.formatted;

  if (formatted.length > maxLength) {
    return formatted.substring(0, maxLength - 3) + '...';
  }

  return formatted;
}

/**
 * Get country name from ISO2 code
 */
export function getCountryName(iso2: string): string {
  const countryNames: Record<string, string> = {
    us: 'United States',
    co: 'Colombia',
    mx: 'Mexico',
    gb: 'United Kingdom',
    ca: 'Canada',
    br: 'Brazil',
    ar: 'Argentina',
    es: 'Spain',
    fr: 'France',
    de: 'Germany',
    it: 'Italy',
    in: 'India',
    cn: 'China',
    jp: 'Japan',
    au: 'Australia',
    // Add more as needed
  };

  return countryNames[iso2.toLowerCase()] || iso2.toUpperCase();
}

/**
 * Privacy map for demo phone numbers
 * Maps specific phone numbers to display names
 */
const PRIVACY_MAP: Record<string, string> = {
  '573116613414': 'Mateo',
  '+573116613414': 'Mateo',
  '573233213692': 'Helena',
  '+573233213692': 'Helena',
};

/**
 * Get display name for phone number (privacy-aware)
 * Returns the privacy name if it's a known number, otherwise returns formatted phone
 */
export function getPhoneDisplayName(phoneNumber: string): string {
  // Normalize phone number (remove spaces, dashes, etc.)
  const normalized = phoneNumber.replace(/[\s\-()]/g, '');

  // Check privacy map (case-insensitive for values)
  const privacyName = PRIVACY_MAP[normalized];
  if (privacyName) {
    return privacyName;
  }

  // Otherwise return formatted phone
  return formatPhoneShort(phoneNumber);
}

/**
 * Check if a phone number should be anonymized
 */
export function isPrivateNumber(phoneNumber: string): boolean {
  const normalized = phoneNumber.replace(/[\s\-()]/g, '');
  return normalized in PRIVACY_MAP;
}

/**
 * Convert name to phone number (reverse lookup)
 * Usage: Type "Mateo" or "mateo" in the input → converts to +573116613414
 */
export function nameToPhone(input: string): string {
  const normalized = input.trim().toLowerCase();

  // Reverse map: name → phone number
  const nameToPhoneMap: Record<string, string> = {
    'mateo': '+573116613414',
    'helena': '+573233213692',
  };

  return nameToPhoneMap[normalized] || input;
}
