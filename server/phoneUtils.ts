export interface PhoneValidationResult {
  valid: boolean;
  normalized?: string; // e.g. +919876543210
  display?: string; // e.g. +91 98765 43210
  error?: string;
}

export function validateIndianPhone(phone: string): PhoneValidationResult {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Please enter a valid phone number.' };
  }

  let cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, '');

  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, error: 'Phone number can only contain numerical digits.' };
  }

  if (cleaned.length !== 10) {
    return {
      valid: false,
      error: `Invalid length: Expected a 10-digit Indian mobile number (got ${cleaned.length} digits).`,
    };
  }

  if (!/^[6-9]/.test(cleaned)) {
    return {
      valid: false,
      error: 'Invalid mobile number. Indian mobile numbers must start with 6, 7, 8, or 9.',
    };
  }

  if (/^(\d)\1{9}$/.test(cleaned)) {
    return {
      valid: false,
      error: 'Invalid mobile number: repeating digit sequences are not allowed.',
    };
  }

  const invalidSequences = [
    '0123456789',
    '1234567890',
    '9876543210',
    '0987654321',
  ];
  if (invalidSequences.includes(cleaned)) {
    return {
      valid: false,
      error: 'Invalid mobile number: sequential numbers are not allowed.',
    };
  }

  const normalized = `+91${cleaned}`;
  const display = `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;

  return {
    valid: true,
    normalized,
    display,
  };
}
