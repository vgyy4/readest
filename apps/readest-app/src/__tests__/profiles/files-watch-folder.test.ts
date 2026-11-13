import { describe, expect, it } from 'vitest';
import { filesWatchPath, safeFolderName } from '@/libs/profiles/filesWatchFolder';

describe('safeFolderName', () => {
  it('keeps ordinary names, including accents and other scripts', () => {
    expect(safeFolderName('Noa')).toBe('Noa');
    expect(safeFolderName('José')).toBe('José');
    expect(safeFolderName('נועה')).toBe('נועה');
  });

  it('removes what a file name cannot hold, and surrounding space and dots', () => {
    expect(safeFolderName('  a/b:c*?"<>|d  ')).toBe('a_b_c______d');
    expect(safeFolderName('..hidden.')).toBe('hidden');
  });

  it('never ends up empty', () => {
    expect(safeFolderName('')).toBe('Profile');
    expect(safeFolderName('///')).toBe('Profile');
  });
});

describe('filesWatchPath', () => {
  it('is Readest Watch / Main for the main profile', () => {
    expect(filesWatchPath('/var/mobile/Documents', null)).toBe(
      '/var/mobile/Documents/Readest Watch/Main',
    );
  });

  it('is a folder of its own for each profile, by name', () => {
    expect(filesWatchPath('/var/mobile/Documents/', 'Noa')).toBe(
      '/var/mobile/Documents/Readest Watch/Noa',
    );
  });
});
