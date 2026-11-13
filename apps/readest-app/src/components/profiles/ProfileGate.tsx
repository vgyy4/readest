'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import { getActiveProfileId, setActiveProfileId } from '@/libs/profiles/active';
import { chooseAvatar, fetchProfiles, getCachedProfiles } from '@/libs/profiles/client';
import type { ProfilesState } from '@/libs/profiles/cache';
import {
  enterProfile,
  consumeSwitchRequest,
  hasChosenProfile,
  hasProfiles,
  leaveProfile,
  shouldReturnToPicker,
  markAvatarSkipped,
  markProfileChosen,
  needsAvatar,
} from '@/libs/profiles/launch';
import AvatarPicker from './AvatarPicker';
import ProfilePicker from './ProfilePicker';

type Phase = 'init' | 'checking' | 'picker' | 'avatar' | 'error' | 'pass';

/** The device could not reach the server at all (offline), as opposed to the server refusing. */
export const isOffline = (error: unknown) =>
  error instanceof TypeError ||
  /failed to fetch|load failed|network|offline|timed out|abort/i.test(String(error));

const isGatedPath = (pathname: string | null) =>
  !!pathname && (pathname.startsWith('/library') || pathname.startsWith('/reader'));

/**
 * Holds the library and the reader back until a profile has been chosen for this launch,
 * and asks a profile for its picture the first time it is opened. Accounts without profiles
 * and signed-out devices pass straight through.
 */
const ProfileGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const _ = useTranslation();
  const { token } = useAuth();
  const pathname = usePathname();
  const gated = !!token && isGatedPath(pathname);
  const [phase, setPhase] = useState<Phase>('init');
  const [state, setState] = useState<ProfilesState | null>(null);
  const [loadError, setLoadError] = useState('');

  const afterChoice = () => {
    const cached = getCachedProfiles();
    setState(cached);
    setPhase(needsAvatar(cached, getActiveProfileId()) ? 'avatar' : 'pass');
  };

  // Ask the server who the profiles are. Offline with nothing saved, carry on as the main
  // profile rather than lock the app; any other failure is shown, not swallowed.
  const loadProfiles = () => {
    setPhase('checking');
    setLoadError('');
    fetchProfiles()
      .then((next) => {
        if (hasProfiles(next)) {
          setState(next);
          setPhase('picker');
        } else {
          // "Switch profile" with nothing to switch to: say why the screen did not appear.
          if (consumeSwitchRequest()) {
            // The toast listener lives on the library page, which mounts just after this.
            window.setTimeout(() => {
              void eventDispatcher.dispatch('toast', {
                message: _(
                  'This account has no profiles yet. Add one from the menu: Account, then Profiles.',
                ),
                type: 'info',
                timeout: 5000,
              });
            }, 800);
          }
          markProfileChosen();
          setPhase('pass');
        }
      })
      .catch((error: unknown) => {
        if (isOffline(error)) {
          markProfileChosen();
          setPhase('pass');
          return;
        }
        setLoadError(error instanceof Error ? error.message : String(error));
        setPhase('error');
      });
  };

  useEffect(() => {
    if (!gated) return;
    if (hasChosenProfile()) {
      afterChoice();
      return;
    }
    // A new launch: show the profile screen, acting as the account (not as last time's profile).
    setActiveProfileId(null);
    const cached = getCachedProfiles();
    if (hasProfiles(cached)) {
      setState(cached);
      setPhase('picker');
      // Pictures or names may have changed on another device.
      void fetchProfiles()
        .then(setState)
        .catch(() => {});
      return;
    }
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gated]);

  // Pressing Home and coming back much later is opening the app again: ask who is reading.
  useEffect(() => {
    if (!gated || phase !== 'pass') return;
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (hiddenAt && shouldReturnToPicker(Date.now() - hiddenAt, getCachedProfiles())) {
        leaveProfile();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [gated, phase]);

  if (!gated || phase === 'pass') return <>{children}</>;

  if (phase === 'picker' && state) {
    return (
      <ProfilePicker
        state={state}
        onEnter={(id) => {
          enterProfile(id);
          afterChoice();
        }}
      />
    );
  }

  if (phase === 'avatar') {
    const id = getActiveProfileId();
    const name = id ? (state?.profiles.find((p) => p.id === id)?.name ?? '') : _('Main profile');
    return (
      <div className='bg-base-200 text-base-content full-height flex w-full flex-col pt-[env(safe-area-inset-top)]'>
        <AvatarPicker
          name={name}
          onPick={async (avatar) => {
            await chooseAvatar(avatar);
            setPhase('pass');
          }}
          onSkip={() => {
            markAvatarSkipped(id);
            setPhase('pass');
          }}
        />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className='bg-base-200 text-base-content full-height flex w-full flex-col items-center justify-center gap-4 px-8 text-center'>
        <h1 className='font-serif text-2xl'>{_('Could not load the profiles')}</h1>
        <p role='alert' className='text-base-content/70 max-w-md text-sm'>
          {loadError}
        </p>
        <div className='flex gap-3'>
          <button type='button' className='btn btn-ghost' onClick={() => loadProfiles()}>
            {_('Try again')}
          </button>
          <button
            type='button'
            className='btn btn-contrast'
            onClick={() => {
              enterProfile(null);
              afterChoice();
            }}
          >
            {_('Continue as main profile')}
          </button>
        </div>
      </div>
    );
  }

  return <div className='bg-base-200 full-height w-full' />;
};

export default ProfileGate;
