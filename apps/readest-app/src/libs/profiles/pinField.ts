import type { CSSProperties, InputHTMLAttributes } from 'react';

/**
 * Attributes for a field that takes a PIN. A PIN is not a password the browser or a password manager
 * should offer to save, fill or generate: a `type="password"` field makes them do all three. So it is
 * a numeric text field that names none of that (`autocomplete="off"`, a name that is not a
 * credential's), with the opt-out attributes the common managers honour (1Password, Bitwarden,
 * LastPass, Proton Pass, Dashlane). Pair it with {@link PIN_MASK_STYLE} to hide the digits.
 */
export const pinFieldAttributes = {
  type: 'text',
  inputMode: 'numeric',
  pattern: '[0-9]*',
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
  name: 'pin-code',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-bwignore': 'true',
  'data-protonpass-ignore': 'true',
  'data-form-type': 'other',
} as const satisfies InputHTMLAttributes<HTMLInputElement> & Record<`data-${string}`, string>;

/** Shows the digits as dots without the field being a password (WebKit and Blink, which the apps use). */
export const PIN_MASK_STYLE = { WebkitTextSecurity: 'disc' } as CSSProperties;
