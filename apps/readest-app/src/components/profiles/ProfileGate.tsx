'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getActiveProfileId, setActiveProfileId } from '@/libs/profiles/active';
import { chooseAvatar, fetchProfiles, getCachedProfiles } from '@/libs/profiles/client';
import type { ProfilesState } from '@/libs/profiles/cache';
import {
  enterProfile,
  hasChosenProfile,
  hasProfiles,
  markAvatarSkipped,
  markProfileChosen,
  needsAvatar,
} from '@/libs/profiles/launch';
import AvatarPicker from './AvatarPicker';
import ProfilePicker from './ProfilePicker';

type Phase = 'init' | 'checking' | 'picker' | 'avatar' | 'pass';

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

  const afterChoice = () => {
    const cached = getCachedProfiles();
    setState(cached);
    setPhase(needsAvatar(cached, getActiveProfileId()) ? 'avatar' : 'pass');
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
    setPhase('checking');
    fetchProfiles()
      .then((next) => {
        if (hasProfiles(next)) {
          setState(next);
          setPhase('picker');
        } else {
          markProfileChosen();
          setPhase('pass');
        }
      })
      .catch(() => {
        // Offline and nothing known: carry on as the main profile rather than lock the app.
        markProfileChosen();
        setPhase('pass');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gated]);

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

  return <div className='bg-base-200 full-height w-full' />;
};

export default ProfileGate;
