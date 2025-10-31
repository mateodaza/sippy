import { ParsedCommand } from '../types/index.js';

function extractDigitsFromPlus(source?: string): string | null {
  if (!source) return null;

  const match = source.match(/\+([\d\s\-().]+)/);
  if (!match) {
    return null;
  }

  const digits = match[1].replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

function extractDigitsFromDoubleZero(source?: string): string | null {
  if (!source) return null;

  const match = source.match(/(?:^|\s)00([\d\s\-().]+)/);
  if (!match) {
    return null;
  }

  const digits = match[1].replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/**
 * Privacy map: Convert names to phone numbers (case-insensitive)
 */
const NAME_TO_PHONE_MAP: Record<string, string> = {
  'mateo': '573116613414',
  'helena': '573233213692',
};

export function normalizePhoneNumber(
  rawPhone: string,
  originalText?: string
): string | null {
  if (!rawPhone) {
    return null;
  }

  // Check if rawPhone is a recognized name (case-insensitive)
  const normalizedName = rawPhone.trim().toLowerCase();
  if (NAME_TO_PHONE_MAP[normalizedName]) {
    return NAME_TO_PHONE_MAP[normalizedName];
  }

  const digitsOnly = rawPhone.replace(/\D/g, '');
  if (!digitsOnly) {
    return null;
  }

  // International formats with "+" prefix (LLM output or user input)
  const explicitInternational =
    extractDigitsFromPlus(rawPhone) ||
    extractDigitsFromPlus(originalText) ||
    extractDigitsFromDoubleZero(rawPhone) ||
    extractDigitsFromDoubleZero(originalText);

  if (explicitInternational) {
    if (explicitInternational.endsWith(digitsOnly)) {
      return explicitInternational;
    }

    if (digitsOnly.startsWith(explicitInternational)) {
      return digitsOnly;
    }

    return explicitInternational;
  }

  // Allow configurable default for local numbers without country code
  const defaultCountryCode = (process.env.DEFAULT_COUNTRY_CODE || '').replace(
    /\D/g,
    ''
  );

  if (defaultCountryCode && digitsOnly.length === 10) {
    return `${defaultCountryCode}${digitsOnly}`;
  }

  return digitsOnly;
}

export type SendVerificationMismatch = 'amount' | 'recipient' | 'invalid';

export interface SendVerificationResult {
  match: boolean;
  mismatchReason?: SendVerificationMismatch;
}

/**
 * Simple validation for LLM-parsed send commands
 * We validate basic format and let the send service handle the rest
 */
export function verifySendAgreement(
  llmResult: ParsedCommand,
  regexVerification: ParsedCommand,
  originalText: string
): SendVerificationResult {
  // Validate amount is present and reasonable
  if (typeof llmResult.amount !== 'number' || llmResult.amount <= 0) {
    return { match: false, mismatchReason: 'invalid' };
  }

  // Validate amount is not absurdly large (consistent with LLM validation)
  if (llmResult.amount > 100000) {
    return { match: false, mismatchReason: 'amount' };
  }

  // Validate phone number format: must have at least 10 digits
  if (!llmResult.recipient) {
    return { match: false, mismatchReason: 'recipient' };
  }

  // First, try to normalize the recipient (handles name aliases like "Helena")
  const normalizedRecipient = normalizePhoneNumber(llmResult.recipient, originalText);

  // If normalization failed, validate as raw recipient
  const recipientToValidate = normalizedRecipient || llmResult.recipient;

  // Remove formatting to get clean digits (accept with or without +)
  const cleanRecipient = recipientToValidate.replace(/[\s\-().]/g, '');

  // Accept either: +NNNNNNNNNN (with +) or NNNNNNNNNN (bare digits)
  const withPlusPattern = /^\+\d{10,}$/;
  const bareDigitsPattern = /^\d{10,}$/;

  if (
    !withPlusPattern.test(cleanRecipient) &&
    !bareDigitsPattern.test(cleanRecipient)
  ) {
    return { match: false, mismatchReason: 'recipient' };
  }

  // If regex also parsed it successfully, compare amounts as a sanity check
  if (
    regexVerification.command === 'send' &&
    typeof regexVerification.amount === 'number'
  ) {
    const amountsMatch =
      Math.abs(llmResult.amount - regexVerification.amount) < 0.01;
    if (!amountsMatch) {
      return { match: false, mismatchReason: 'amount' };
    }
  }

  // Valid format - trust the LLM and let the send service validate existence
  return { match: true };
}
