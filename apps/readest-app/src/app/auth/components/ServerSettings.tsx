import React, { useState } from 'react';
import { MdDns } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import {
  clearServer,
  discoverServer,
  getStoredServer,
  saveServer,
  ServerCheckFailure,
  type ServerCheckError,
} from '@/libs/serverConfig';
import { supabase } from '@/utils/supabase';

interface ServerSettingsProps {
  /** Called once a new server is saved; the app reloads so everything uses it. */
  onApplied?: () => void;
}

/**
 * "Which server?" on the sign-in screen: the user types their own server's address
 * (and, if it sits behind Cloudflare Access, a service token) instead of the app being
 * built for one server. The default is Readest's own cloud.
 */
const ServerSettings: React.FC<ServerSettingsProps> = ({
  onApplied = () => window.location.reload(),
}) => {
  const _ = useTranslation();
  const stored = getStoredServer();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(stored?.apiBaseUrl ?? '');
  const [clientId, setClientId] = useState(stored?.cfAccessClientId ?? '');
  const [clientSecret, setClientSecret] = useState(stored?.cfAccessClientSecret ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ServerCheckError | null>(null);

  const messages: Record<ServerCheckError, string> = {
    'invalid-url': _('Enter a valid address, like books.example.com'),
    unreachable: _('Could not reach the server. Check the address and your connection.'),
    blocked: _(
      'The server refused the request. If it is behind Cloudflare Access, add a service token below.',
    ),
    'not-readest': _('This does not look like a Readest server.'),
  };

  const switchTo = async (apply: () => void) => {
    // Sessions belong to the server that issued them.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    apply();
    onApplied();
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const server = await discoverServer(url, { clientId, clientSecret });
      await switchTo(() => saveServer(server));
    } catch (e) {
      setError(e instanceof ServerCheckFailure ? e.reason : 'unreachable');
    } finally {
      setBusy(false);
    }
  };

  let label = _('Readest cloud');
  if (stored) {
    try {
      label = new URL(stored.apiBaseUrl).host;
    } catch {
      label = stored.apiBaseUrl;
    }
  }

  return (
    <div className='mt-8 w-full max-w-sm text-sm'>
      <button
        type='button'
        className='text-base-content/70 mx-auto flex items-center gap-2'
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MdDns />
        <span>
          {_('Server')}: {label}
        </span>
      </button>

      {open && (
        <div className='bg-base-200 mt-3 flex flex-col gap-3 rounded-2xl p-4'>
          <label className='flex flex-col gap-1'>
            <span className='text-base-content/70'>{_('Server address')}</span>
            <input
              type='url'
              inputMode='url'
              autoCapitalize='off'
              autoCorrect='off'
              spellCheck={false}
              className='input input-bordered w-full'
              placeholder='books.example.com'
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>

          <details>
            <summary className='text-base-content/70 cursor-pointer'>
              {_('Cloudflare Access (optional)')}
            </summary>
            <div className='mt-2 flex flex-col gap-2'>
              <input
                aria-label={_('Client ID')}
                className='input input-bordered w-full'
                placeholder={_('Client ID')}
                autoCapitalize='off'
                autoCorrect='off'
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
              <input
                aria-label={_('Client secret')}
                type='password'
                className='input input-bordered w-full'
                placeholder={_('Client secret')}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
          </details>

          {error && (
            <p role='alert' className='text-error'>
              {messages[error]}
            </p>
          )}

          <div className='flex flex-wrap justify-end gap-2'>
            {stored && (
              <button
                type='button'
                className='btn btn-ghost btn-sm'
                disabled={busy}
                onClick={() => void switchTo(clearServer)}
              >
                {_('Use Readest cloud')}
              </button>
            )}
            <button
              type='button'
              className='btn btn-contrast btn-sm'
              disabled={busy || !url.trim()}
              onClick={() => void connect()}
            >
              {busy ? _('Connecting…') : _('Connect')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServerSettings;
